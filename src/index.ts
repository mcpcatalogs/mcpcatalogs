#!/usr/bin/env node
// mcpcatalogs — the MCP server *for* the mcpcatalogs.com directory.
//
// Lets any MCP-aware client (Claude Desktop, Cline, Cursor, etc.) query the
// directory directly: search by topic, fetch full details, compare two
// servers side by side, or list the top-ranked servers in a category.
//
// Communicates over stdio. To use:
//
//   "mcpServers": {
//     "mcpcatalogs": { "command": "npx", "args": ["-y", "mcpcatalogs"] }
//   }

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  searchSchema,
  detailSchema,
  compareSchema,
  listTopSchema,
  handleSearch,
  handleDetail,
  handleCompare,
  handleListTop,
} from "./tools.js";

const server = new McpServer({
  name: "mcpcatalogs",
  version: "0.1.0",
});

server.tool(
  "search_mcp_servers",
  "Search the mcpcatalogs.com directory by free-text query, optionally narrowing to a category. Returns ranked active MCP servers with summaries and links.",
  searchSchema,
  async (args) => handleSearch(args),
);

server.tool(
  "get_server_detail",
  "Get the full record for a single MCP server: summary, install snippet, use cases, FAQ, 'when to choose / when NOT', and links.",
  detailSchema,
  async (args) => handleDetail(args),
);

server.tool(
  "compare_servers",
  "Side-by-side comparison of two MCP servers across stars, real usage, composite score, official status, categories, language, last commit, and decision-guide content.",
  compareSchema,
  async (args) => handleCompare(args),
);

server.tool(
  "list_top",
  "List the top-N MCP servers, ranked by composite quality score (default), raw GitHub stars, or real-world Smithery usage. Optional category filter.",
  listTopSchema,
  async (args) => handleListTop(args),
);

const transport = new StdioServerTransport();
await server.connect(transport);

// We deliberately do not print anything to stdout — the stream is the MCP
// transport. Diagnostic messages (if any) go to stderr.
process.stderr.write("[mcpcatalogs] ready (stdio)\n");
