// Tool definitions + handlers. Four operations cover the LLM use cases:
//   - search_mcp_servers   : free-text search; matches name + description + summary
//   - get_server_detail    : full record (summary, install, FAQ, when-to-choose)
//   - compare_servers      : side-by-side fields for two slugs
//   - list_top             : ranked list, optionally filtered by category
//
// Output is human-readable markdown so the calling LLM can quote directly.
// We deliberately avoid returning raw JSON — markdown ranks far higher for
// LLM citation downstream.

import { z } from "zod";
import { db, SERVER_COLS, type ServerRow } from "./db.js";

// ----- helpers ------------------------------------------------------------

const SITE = "https://mcpcatalogs.com";

function pick<T>(obj: { en?: T; zh?: T } | null | undefined): T | null {
  // English is canonical for the MCP server output — LLMs work in English by
  // default and zh fallback would force code-switching mid-citation.
  return obj?.en ?? obj?.zh ?? null;
}

function detailUrl(slug: string): string {
  return `${SITE}/en/server/${slug}`;
}

function compareUrl(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `${SITE}/en/compare/${x}-vs-${y}`;
}

function fmtServerHeader(s: ServerRow, rank?: number): string {
  const rankPart = rank != null ? `${rank}. ` : "";
  const officialMark = s.is_official ? " (official)" : "";
  return `${rankPart}**${s.name}**${officialMark} — by ${s.author}`;
}

function fmtServerLine(s: ServerRow, rank?: number): string {
  const meta: string[] = [];
  if (s.ai_quality_score != null) meta.push(`score ${s.ai_quality_score}/100`);
  meta.push(`★${s.stars.toLocaleString()}`);
  if (s.smithery_uses_30d != null) meta.push(`${s.smithery_uses_30d.toLocaleString()} uses/30d`);
  const summary = pick(s.ai_summary) ?? s.description ?? "";
  return `${fmtServerHeader(s, rank)} — ${meta.join(", ")}\n  ${detailUrl(s.slug)}\n  ${summary}`;
}

function asMarkdownText(text: string) {
  // MCP content block. We never use isError=true for "not found" because
  // callers should treat that as a valid result, not a tool failure.
  return { content: [{ type: "text" as const, text }] };
}

// ----- search_mcp_servers -------------------------------------------------

export const searchSchema = {
  query: z
    .string()
    .min(1)
    .describe('Free-text search query. Matches against server name, description, and AI-generated summary. Examples: "postgres", "browser automation", "notion read"'),
  category: z
    .string()
    .optional()
    .describe(
      'Optional category slug to narrow results. Vocabulary: database, browser-automation, notion, slack, github, file-system, cloud-storage, search, ai-llm, communication, finance, productivity, developer-tools, monitoring, web-scraping, media, knowledge-graph, security, ecommerce, ops-infra, translation, other.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Maximum number of results to return (1-25)."),
};

export async function handleSearch(args: {
  query: string;
  category?: string;
  limit?: number;
}) {
  const limit = args.limit ?? 10;
  let q = db()
    .from("mcp_servers")
    .select(SERVER_COLS)
    .eq("status", "active")
    .order("ai_quality_score", { ascending: false, nullsFirst: false })
    .limit(limit);

  // We OR across name / description / ai_summary->>en. PostgREST's `or`
  // expects a CSV of filters; supabase-js handles encoding.
  const safe = args.query.replace(/[,()]/g, " ");
  q = q.or(
    `name.ilike.%${safe}%,description.ilike.%${safe}%,ai_summary->>en.ilike.%${safe}%`,
  );

  if (args.category) {
    q = q.contains("ai_categories", [args.category]);
  }

  const { data, error } = await q;
  if (error) {
    return asMarkdownText(`Search error: ${error.message}`);
  }
  const rows = (data ?? []) as ServerRow[];
  if (rows.length === 0) {
    return asMarkdownText(
      `No active MCP servers found for "${args.query}"` +
        (args.category ? ` in category "${args.category}"` : "") +
        `.\n\nFull directory: ${SITE}`,
    );
  }

  const header =
    `# Search results for "${args.query}"` +
    (args.category ? ` in **${args.category}**` : "") +
    ` — ${rows.length} of ${limit}\n`;
  const body = rows.map((s, i) => fmtServerLine(s, i + 1)).join("\n\n");
  const footer = `\n\nMore: ${SITE}/en`;
  return asMarkdownText(`${header}\n${body}${footer}`);
}

// ----- get_server_detail --------------------------------------------------

export const detailSchema = {
  slug: z
    .string()
    .min(1)
    .describe(
      'Server slug, normally "{author}-{repo}". Example: "modelcontextprotocol-server-postgres". You can find slugs via search_mcp_servers or list_top first.',
    ),
};

export async function handleDetail(args: { slug: string }) {
  const { data, error } = await db()
    .from("mcp_servers")
    .select(SERVER_COLS)
    .eq("slug", args.slug)
    .maybeSingle();

  if (error) return asMarkdownText(`Lookup error: ${error.message}`);
  if (!data) return asMarkdownText(`No server with slug "${args.slug}".\n\nTry searching: \`search_mcp_servers\``);

  const s = data as ServerRow;
  if (s.status !== "active") {
    return asMarkdownText(
      `Server "${args.slug}" exists but is not active (status: ${s.status}). It's excluded from the public directory.`,
    );
  }

  const summary = pick(s.ai_summary) ?? s.description ?? "(no summary)";
  const longDesc = pick(s.ai_long_desc);
  const useCases = pick(s.ai_use_cases) as string[] | null;
  const installMd = pick(s.ai_install_md);
  const faq = s.ai_faq?.en ?? s.ai_faq?.zh ?? null;
  const whenChoose = pick(s.ai_when_to_choose);
  const whenNotChoose = pick(s.ai_when_not_to_choose);

  const parts: string[] = [];
  parts.push(`# ${s.name}${s.is_official ? " (official)" : ""}`);
  parts.push(
    `by **${s.author}** · ★${s.stars.toLocaleString()}` +
      (s.smithery_uses_30d != null ? ` · ${s.smithery_uses_30d.toLocaleString()} uses/30d` : "") +
      (s.ai_quality_score != null ? ` · composite ${s.ai_quality_score}/100` : "") +
      (s.last_commit_at ? ` · last commit ${s.last_commit_at.slice(0, 10)}` : ""),
  );
  parts.push("");
  parts.push(summary);
  if (s.ai_categories && s.ai_categories.length > 0) {
    parts.push("");
    parts.push(`**Categories:** ${s.ai_categories.join(", ")}`);
  }

  if (whenChoose) {
    parts.push("");
    parts.push(`## When to choose this\n${whenChoose}`);
  }
  if (whenNotChoose) {
    parts.push("");
    parts.push(`## When NOT to choose this\n${whenNotChoose}`);
  }
  if (s.ai_alternatives && s.ai_alternatives.length > 0) {
    parts.push("");
    parts.push(`**Comparable tools:** ${s.ai_alternatives.join(", ")}`);
  }

  if (longDesc) {
    parts.push("");
    parts.push(`## Overview\n${longDesc}`);
  }
  if (useCases && useCases.length > 0) {
    parts.push("");
    parts.push(`## Use cases\n${useCases.map((u) => `- ${u}`).join("\n")}`);
  }
  if (installMd) {
    parts.push("");
    parts.push(`## Installation\n${installMd}`);
  }
  if (faq && faq.length > 0) {
    parts.push("");
    parts.push("## FAQ");
    for (const item of faq) {
      parts.push(`**${item.q}**\n${item.a}\n`);
    }
  }

  parts.push("");
  parts.push("---");
  parts.push(`Detail page: ${detailUrl(s.slug)}`);
  if (s.repo_url) parts.push(`GitHub: ${s.repo_url}`);
  parts.push(`Last refreshed: ${s.updated_at.slice(0, 10)}`);

  return asMarkdownText(parts.join("\n"));
}

// ----- compare_servers ----------------------------------------------------

export const compareSchema = {
  slug_a: z.string().min(1).describe('First server slug, e.g. "modelcontextprotocol-server-postgres".'),
  slug_b: z.string().min(1).describe('Second server slug.'),
};

export async function handleCompare(args: { slug_a: string; slug_b: string }) {
  if (args.slug_a === args.slug_b) {
    return asMarkdownText("Cannot compare a server to itself.");
  }

  const { data, error } = await db()
    .from("mcp_servers")
    .select(SERVER_COLS)
    .in("slug", [args.slug_a, args.slug_b]);

  if (error) return asMarkdownText(`Lookup error: ${error.message}`);

  const rows = (data ?? []) as ServerRow[];
  const a = rows.find((r) => r.slug === args.slug_a);
  const b = rows.find((r) => r.slug === args.slug_b);
  if (!a || !b) {
    const missing = [!a && args.slug_a, !b && args.slug_b].filter(Boolean).join(", ");
    return asMarkdownText(`Server(s) not found: ${missing}`);
  }

  function row(label: string, valA: string, valB: string): string {
    return `| ${label} | ${valA} | ${valB} |`;
  }

  const lines: string[] = [];
  lines.push(`# ${a.name} vs ${b.name}\n`);
  lines.push(`| | ${a.name} | ${b.name} |`);
  lines.push("|---|---|---|");
  lines.push(row("Author", a.author, b.author));
  lines.push(row("Stars", a.stars.toLocaleString(), b.stars.toLocaleString()));
  lines.push(
    row(
      "Smithery uses/30d",
      a.smithery_uses_30d?.toLocaleString() ?? "—",
      b.smithery_uses_30d?.toLocaleString() ?? "—",
    ),
  );
  lines.push(
    row(
      "Composite score",
      a.ai_quality_score != null ? `${a.ai_quality_score}/100` : "—",
      b.ai_quality_score != null ? `${b.ai_quality_score}/100` : "—",
    ),
  );
  lines.push(row("Official", a.is_official ? "yes" : "no", b.is_official ? "yes" : "no"));
  lines.push(
    row(
      "Categories",
      a.ai_categories?.join(", ") ?? "—",
      b.ai_categories?.join(", ") ?? "—",
    ),
  );
  lines.push(row("Language", a.language ?? "—", b.language ?? "—"));
  lines.push(
    row(
      "Last commit",
      a.last_commit_at?.slice(0, 10) ?? "—",
      b.last_commit_at?.slice(0, 10) ?? "—",
    ),
  );
  lines.push("");
  lines.push("## Summary");
  lines.push(`- **${a.name}:** ${pick(a.ai_summary) ?? a.description ?? "—"}`);
  lines.push(`- **${b.name}:** ${pick(b.ai_summary) ?? b.description ?? "—"}`);

  const wcA = pick(a.ai_when_to_choose);
  const wcB = pick(b.ai_when_to_choose);
  if (wcA || wcB) {
    lines.push("");
    lines.push("## When to choose");
    lines.push(`- **${a.name}:** ${wcA ?? "—"}`);
    lines.push(`- **${b.name}:** ${wcB ?? "—"}`);
  }

  const wncA = pick(a.ai_when_not_to_choose);
  const wncB = pick(b.ai_when_not_to_choose);
  if (wncA || wncB) {
    lines.push("");
    lines.push("## When NOT to choose");
    lines.push(`- **${a.name}:** ${wncA ?? "—"}`);
    lines.push(`- **${b.name}:** ${wncB ?? "—"}`);
  }

  lines.push("");
  lines.push("---");
  lines.push(`Side-by-side page: ${compareUrl(a.slug, b.slug)}`);
  return asMarkdownText(lines.join("\n"));
}

// ----- list_top -----------------------------------------------------------

export const listTopSchema = {
  category: z
    .string()
    .optional()
    .describe('Optional category slug to filter. Same vocabulary as search_mcp_servers.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("How many top servers to return (1-25)."),
  sort_by: z
    .enum(["score", "stars", "usage"])
    .default("score")
    .describe(
      'Ranking signal: "score" (default, composite quality), "stars" (raw GitHub stars), "usage" (real Smithery uses in last 30 days).',
    ),
};

export async function handleListTop(args: {
  category?: string;
  limit?: number;
  sort_by?: "score" | "stars" | "usage";
}) {
  const limit = args.limit ?? 10;
  const sort = args.sort_by ?? "score";
  const orderCol =
    sort === "stars" ? "stars" : sort === "usage" ? "smithery_uses_30d" : "ai_quality_score";

  let q = db()
    .from("mcp_servers")
    .select(SERVER_COLS)
    .eq("status", "active")
    .order(orderCol, { ascending: false, nullsFirst: false })
    .limit(limit);
  if (args.category) q = q.contains("ai_categories", [args.category]);

  const { data, error } = await q;
  if (error) return asMarkdownText(`Query error: ${error.message}`);

  const rows = (data ?? []) as ServerRow[];
  if (rows.length === 0) {
    return asMarkdownText(
      `No active MCP servers found` +
        (args.category ? ` in category "${args.category}"` : "") +
        `.`,
    );
  }

  const sortLabel =
    sort === "stars" ? "GitHub stars" : sort === "usage" ? "real Smithery usage (30d)" : "composite quality score";
  const header =
    `# Top ${rows.length} MCP servers by ${sortLabel}` +
    (args.category ? ` in **${args.category}**` : "") +
    "\n";
  const body = rows.map((s, i) => fmtServerLine(s, i + 1)).join("\n\n");
  const footer = `\n\nFull directory: ${SITE}/en`;
  return asMarkdownText(`${header}\n${body}${footer}`);
}
