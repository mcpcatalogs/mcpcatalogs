// Supabase client for the self-MCP server.
//
// We embed the public anon key as a fallback so `npx mcpcatalogs` works
// zero-config. The anon key is RLS-scoped (read-only on active rows) — it's
// designed to be shipped to browsers and is functionally a public token.
// Users can still override via env vars if they fork to a private DB.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.MCPCATALOGS_SUPABASE_URL ??
  "https://dehbdxnnqrzemozomyyy.supabase.co";

// NOTE: replace placeholder before `npm publish`. The real anon key is
// safe to embed — see header. Until then, set MCPCATALOGS_SUPABASE_ANON_KEY
// in your environment.
const EMBEDDED_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlaGJkeG5ucXJ6ZW1vem9teXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzYwNjgsImV4cCI6MjA5NDUxMjA2OH0.MJvsh3LgbZFgCHONnvX3Afc6qEQcZjPAku0qzluQvLI";

const SUPABASE_ANON_KEY =
  process.env.MCPCATALOGS_SUPABASE_ANON_KEY ?? EMBEDDED_ANON_KEY;

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "REPLACE_BEFORE_PUBLISH") {
    throw new Error(
      "mcpcatalogs: missing MCPCATALOGS_SUPABASE_ANON_KEY. " +
        "If you installed via npx and see this, please open an issue at " +
        "https://github.com/mcpcatalogs/mcpcatalogs/issues — the embedded key was not set.",
    );
  }
  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  return cached;
}

// Columns we expose. ai_* fields are bilingual jsonb { en, zh }.
// homepage_url is in the TypeScript type but not yet a real column in the
// 0001 schema — left out of the select to avoid PostgREST errors. Add back
// the day a migration introduces it.
export const SERVER_COLS = `
  id, slug, name, author, description, language, stars,
  smithery_uses_30d, is_official, last_commit_at, status, repo_url,
  ai_summary, ai_long_desc, ai_use_cases, ai_install_md, ai_faq,
  ai_categories, ai_quality_score,
  ai_when_to_choose, ai_when_not_to_choose, ai_alternatives,
  updated_at
`;

export interface ServerRow {
  id: string;
  slug: string;
  name: string;
  author: string;
  description: string | null;
  language: string | null;
  stars: number;
  smithery_uses_30d: number | null;
  is_official: boolean;
  last_commit_at: string | null;
  status: string;
  repo_url: string | null;
  ai_summary: { en?: string; zh?: string } | null;
  ai_long_desc: { en?: string; zh?: string } | null;
  ai_use_cases: { en?: string[]; zh?: string[] } | null;
  ai_install_md: { en?: string; zh?: string } | null;
  ai_faq: {
    en?: Array<{ q: string; a: string }>;
    zh?: Array<{ q: string; a: string }>;
  } | null;
  ai_categories: string[] | null;
  ai_quality_score: number | null;
  ai_when_to_choose: { en?: string; zh?: string } | null;
  ai_when_not_to_choose: { en?: string; zh?: string } | null;
  ai_alternatives: string[] | null;
  updated_at: string;
}
