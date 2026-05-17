# mcpcatalogs

[![npm](https://img.shields.io/npm/v/mcpcatalogs)](https://www.npmjs.com/package/mcpcatalogs)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

An MCP server that lets your AI assistant query [mcpcatalogs.com](https://mcpcatalogs.com) — the independent bilingual directory of MCP servers — directly inside the chat. **Search, compare, top-list, and dive into full server details without leaving your IDE or Claude Desktop.**

The directory tracks 1,900+ MCP servers, refreshed daily with composite scores combining AI evaluation, GitHub signals, and real-world Smithery usage.

## Tools

| Tool | What it does |
|---|---|
| `search_mcp_servers` | Free-text search by topic, optional category narrowing |
| `get_server_detail` | Full record: install, FAQ, "when to choose / when NOT", alternatives |
| `compare_servers` | Side-by-side comparison between two servers (stars, usage, score, decision-guide) |
| `list_top` | Ranked list by composite quality / GitHub stars / real Smithery usage |

All four return clean markdown — drop-in citation source for LLM answers.

## Install

### Claude Desktop

Edit your Claude Desktop config:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add:

```json
{
  "mcpServers": {
    "mcpcatalogs": {
      "command": "npx",
      "args": ["-y", "mcpcatalogs"]
    }
  }
}
```

Restart Claude Desktop. You should see four new tools in the tools menu.

### Cursor

In Cursor → Settings → Features → MCP:

```json
{
  "mcpcatalogs": {
    "command": "npx",
    "args": ["-y", "mcpcatalogs"]
  }
}
```

### Cline / Continue / other MCP-aware clients

Same shape — point the client at `npx -y mcpcatalogs`.

### Direct HTTP (no install)

If your client supports remote MCP servers over HTTP:

```json
{
  "mcpServers": {
    "mcpcatalogs": {
      "url": "https://mcpcatalogs.com/mcp"
    }
  }
}
```

## Try it

After installing, ask your AI assistant things like:

- *"Search the MCP directory for a Postgres server and rank by real usage."*
- *"Compare modelcontextprotocol-server-postgres and supabase-supabase-mcp."*
- *"What's the top browser-automation MCP server right now?"*
- *"Show me the full detail for antvis-mcp-server-chart, including when I should NOT choose it."*

## Data freshness

The directory refreshes daily from GitHub + Smithery. Each tool call hits a live database, so you always get the latest score, last-commit date, and usage numbers.

## Local development

```sh
git clone https://github.com/mcpcatalogs/mcpcatalogs
cd mcpcatalogs
npm install
npm run build
node dist/index.js
```

To point at a custom backend (e.g. a fork), set environment variables:

```sh
export MCPCATALOGS_SUPABASE_URL=https://your-project.supabase.co
export MCPCATALOGS_SUPABASE_ANON_KEY=your-anon-key
```

## Contributing

Bug reports and PRs welcome. The directory itself (scraping, scoring, AI evaluation) lives in a separate private repo — this package is just the MCP-protocol interface to it.

## License

MIT. See [LICENSE](./LICENSE).
