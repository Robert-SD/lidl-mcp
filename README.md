# lidl-mcp

Model Context Protocol (MCP) server for **Lidl (Lidl Plus)** with built-in multi-country support (`nl` & `de` in a single server). Connects AI assistants (like Claude Desktop, Cursor, and Continue) directly to Lidl’s supermarket services.

Features include **store search & opening hours**, **weekly digital leaflets & PDF brochures**, **Lidl Plus coupons & Coupon Plus**, **digital receipts (kassabonnen / Kassenbons)**, **loyalty summary & stampcards**, and **online shop product lookup**.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Log In (Optional for Public Offers & Stores)
Public endpoints (stores, weekly leaflets, brochures, anonymous promotions) work without logging in. To access your personal coupons, receipts, loyalty card, and favorite store:
```bash
npm run login
```
* Launches Chrome via Playwright stealth to `accounts.lidl.com` (PKCE OAuth2) and captures the `com.lidlplus.app://callback` redirect automatically.
* Headless/manual fallback: `npm run login -- --manual` (or `--country=de`).

### 3. Check Status
```bash
npm run status
```

### 4. Build & Test
```bash
npm run build
npm test
```

---

## 🌍 Multi-Country Support (`nl` & `de`)

A single `lidl-mcp` server supports both **Netherlands (`nl`)** and **Germany (`de`)** simultaneously:
- Default country comes from `LIDL_COUNTRY` (defaults to `nl`).
- Pass `country: "nl"` or `country: "de"` on any country-aware tool to query across borders in the same session (e.g. comparing NL vs. DE weekly offers or checking receipts in both countries).
- Response cache keys are scoped by host, country, language, and auth principal so `nl` and `de` responses never collide.

---

## 🛠️ MCP Tools (26 Tools)

### 1. Authentication, Profile & Loyalty
| Tool | Type | Description |
| :--- | :---: | :--- |
| `lidl_login` | Auth / Session | Check authentication status, refresh expired access token if available, and fetch member identity. |
| `lidl_get_profile` | Read | Get Lidl Accounts OIDC profile & loyalty card details (`nl` / `de`). |
| `lidl_get_loyalty_program` | Read | Get loyalty program status, active stampcards, and bottle deposits. |
| `lidl_cache_stats` | Read | Report process-scoped in-memory cache statistics (`hits`, `misses`, `entries`, `hitRate`). |

### 2. Stores & Opening Hours
| Tool | Type | Description |
| :--- | :---: | :--- |
| `lidl_search_stores` | Read | Search NL or DE stores by city, postal code, address, `storeId`, or coordinates. |
| `lidl_get_store_details` | Read | Get store zone, offer region, amenities, and opening hours for a date. |
| `lidl_get_favorite_store` | Read | Get the user's favorite Lidl store (`nl` / `de`). |
| `lidl_set_favorite_store` | Write | Set the user's favorite Lidl store (`storeId`, `nl` / `de`). |

### 3. Offers, Digital Leaflets, Brochures & Shop Products
| Tool | Type | Description |
| :--- | :---: | :--- |
| `lidl_get_brochures` | Read | List active flyers/brochures with web view URLs and PDF downloads. |
| `lidl_get_campaign_groups` | Read | List active weekly digital leaflet campaign groups and campaigns. |
| `lidl_get_campaign_offers` | Read | Fetch all products and prices inside a digital leaflet campaign. |
| `lidl_search_offers` | Read | Search across active weekly digital leaflet campaigns by keyword. |
| `lidl_get_leaflet_product` | Read | Get full details, pricing, and disclaimers for a leaflet product ID. |
| `lidl_search_shop_products` | Read | Search `lidl.nl` / `lidl.de` online shop assortment by keyword (returns ERP numbers). |
| `lidl_get_shop_product` | Read | Fetch online shop product details by ERP number (`lidl.nl` / `lidl.de`). |

### 4. Coupons & Promotions
| Tool | Type | Description |
| :--- | :---: | :--- |
| `lidl_get_coupons` | Read | List Lidl Plus coupons (falls back to anonymous promotions when logged out). |
| `lidl_get_coupon_details` | Read | Get detailed terms and validity for a coupon/promotion UUID. |
| `lidl_activate_coupon` | Write | Activate a Lidl Plus coupon for checkout. |
| `lidl_deactivate_coupon` | Write | Deactivate an activated Lidl Plus coupon. |
| `lidl_get_coupon_plus` | Read | Get Coupon Plus spend goals and progress. |

### 5. Digital Receipts (Kassabonnen / Kassenbons)
| Tool | Type | Description |
| :--- | :---: | :--- |
| `lidl_list_receipts` | Read | List digital receipts (`nl` / `de`, optional `yearOffset`). |
| `lidl_get_receipt_details` | Read | Get itemized receipt lines, prices, discounts, and store info (cached 30d). |
| `lidl_get_receipt_summary` | Read | Get receipt summary breakdown (cached 30d). |
| `lidl_set_receipt_favorite` | Write | Favorite or unfavorite a digital receipt. |

### 6. Grocery Trip Planning & Purchase History (Per Country)
| Tool | Type | Description |
| :--- | :---: | :--- |
| `lidl_get_regular_products` | Read | Analyze past receipts for one country (`nl` or `de`) to find regular purchases, cadence, and restock candidates. |
| `lidl_plan_grocery_trip` | Read | Match regular purchases and optional extra items in one country against weekly leaflet offers and coupons. |

---

## ⚙️ Environment Variables

| Variable | Description |
| :--- | :--- |
| `LIDL_COUNTRY` | Default 2-letter country code (`nl` or `de`, default: `nl`). |
| `LIDL_LANGUAGE` | Optional language override (`nl`, `de`, etc.). |
| `LIDL_TOKENS_FILE` | Override path to `tokens.json` (defaults to `~/.config/lidl-mcp/tokens.json` or `/data/tokens.json`). |
| `LIDL_REFRESH_TOKEN` | Bootstrap refresh token when no token file exists yet. |
| `LIDL_TOKEN_STORE_URL` | Optional HTTP endpoint for external token persistence. |
| `LIDL_TOKEN_STORE_AUTH` | Optional `Authorization` header for `LIDL_TOKEN_STORE_URL`. |
| `LIDL_MCP_CACHE` | Set to `off` to disable the in-process TTL response cache. |
| `LIDL_MCP_CACHE_MAX_ENTRIES` | Maximum cached entries (default: `2000`). |
| `LIDL_HEADLESS` | Set to `true` to run Playwright login browser headless. |

---

## 📄 License

MIT — see [LICENSE](LICENSE).
