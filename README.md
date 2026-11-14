# lidl-mcp

Model Context Protocol (MCP) server for **Lidl (Lidl Plus)**. Connects AI assistants (like Claude Desktop, Cursor, and Continue) directly to Lidl’s supermarket services.

> **Status:** Foundation scaffold ready. Endpoint definitions and OAuth parameters are pending configuration.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build & Test
```bash
npm run build
npm test
```

### 3. Check Status / Log In
```bash
npm run status
npm run login
```

---

## 🛠️ MCP Tools (Foundation)

| Tool | Type | Description |
| :--- | :---: | :--- |
| `lidl_login` | Read | Check authentication status and token availability. |
| `lidl_cache_stats` | Read | Report in-process response cache statistics (hits, misses, entries, hit rate). |

---

## ⚙️ Environment Variables

| Variable | Description |
| :--- | :--- |
| `LIDL_TOKENS_FILE` | Override path to `tokens.json` (defaults to `~/.config/lidl-mcp/tokens.json` or `/data/tokens.json`). |
| `LIDL_REFRESH_TOKEN` | Bootstrap refresh token when no token file exists yet. |
| `LIDL_TOKEN_STORE_URL` | Optional HTTP endpoint for external token persistence. |
| `LIDL_TOKEN_STORE_AUTH` | Optional `Authorization` header for `LIDL_TOKEN_STORE_URL`. |
| `LIDL_MCP_CACHE` | Set to `off` to disable the in-process TTL response cache. |
| `LIDL_MCP_CACHE_MAX_ENTRIES` | Maximum cached entries (default: `500`). |
| `LIDL_HEADLESS` | Set to `true` to run Playwright login browser headless. |

---

## 📄 License

MIT — see [LICENSE](LICENSE).
