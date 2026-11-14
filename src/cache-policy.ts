import { cacheKey } from "./cache.js";

/**
 * Cache TTLs in milliseconds. Reference catalogs, leaflets, and immutable
 * receipts use long/medium TTLs; live user lists (receipt index, coupons,
 * favorite store) use a short TTL and are invalidated on write actions.
 */
export const CACHE_TTL = {
  /** Live user lists (receipt index, coupons, favorite store): short TTL, invalidated on writes. */
  liveList: 2 * 60 * 1000,
  /** Search results and brochures/offers: churn daily/weekly. */
  search: 30 * 60 * 1000,
  /** Product detail: stable for a day. */
  productDetail: 24 * 60 * 60 * 1000,
  /** Stores & schedules (excluding live user favorites): near-static reference data. */
  catalog: 24 * 60 * 60 * 1000,
  /** Anonymous & digital leaflet promotions, brochures, coupon details. */
  offers: 60 * 60 * 1000,
  /** Closed receipt details & summaries are immutable. */
  receiptDetail: 30 * 24 * 60 * 60 * 1000,
} as const;

export interface CacheRule {
  ttl: number;
  shouldCache?: (payload: any) => boolean;
}

export interface RequestCacheInput {
  host?: string;
  country?: string;
  language?: string;
  method?: string;
  body?: any;
  query?: Record<string, any>;
}

const NON_EMPTY_ARRAY = (payload: any): boolean =>
  Array.isArray(payload) && payload.length > 0;

/**
 * Host + path-prefix cache policies.
 * Paths not listed here stay live by default.
 */
const REST_GET_CACHE_POLICIES: Array<{
  host?: string;
  pattern: RegExp;
  rule: CacheRule;
}> = [
  // Stores list, details, autocomplete, schedules (public reference data)
  {
    host: "stores",
    pattern: /^\/api\/v4\/[a-z]{2}$/i,
    rule: { ttl: CACHE_TTL.catalog, shouldCache: NON_EMPTY_ARRAY },
  },
  {
    host: "stores",
    pattern: /^\/api\/v5\/[a-z]{2}\/details$/i,
    rule: { ttl: CACHE_TTL.catalog, shouldCache: NON_EMPTY_ARRAY },
  },
  {
    host: "stores",
    pattern: /^\/api\/v1\/autocomplete\//i,
    rule: { ttl: CACHE_TTL.search, shouldCache: (p) => Array.isArray(p) },
  },
  {
    host: "stores",
    pattern: /^\/api\/v3\/schedule\//i,
    rule: { ttl: CACHE_TTL.offers, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  // Digital leaflet campaigns & products
  {
    host: "leaflet",
    pattern: /^\/api\/v1\/[a-z]{2}\/campaignGroups/i,
    rule: { ttl: CACHE_TTL.offers, shouldCache: (p) => Array.isArray(p?.groups) },
  },
  {
    host: "leaflet",
    pattern: /^\/api\/v1\/[a-z]{2}\/campaigns\//i,
    rule: { ttl: CACHE_TTL.offers, shouldCache: (p) => Boolean(p?.id) },
  },
  {
    host: "leaflet",
    pattern: /^\/api\/v1\/[a-z]{2}\/products\//i,
    rule: { ttl: CACHE_TTL.productDetail, shouldCache: (p) => Boolean(p?.id) },
  },
  // Brochures
  {
    host: "brochures",
    pattern: /^\/api\/v2\/[a-z]{2}\/Brochures/i,
    rule: { ttl: CACHE_TTL.offers, shouldCache: NON_EMPTY_ARRAY },
  },
  // Favorite store per country (invalidated on setFavoriteStore)
  {
    host: "stores",
    pattern: /^\/api\/v1\/users\/me\/favorite\/[a-z]{2}$/i,
    rule: { ttl: CACHE_TTL.liveList, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  // Authenticated & anonymous promotions list (invalidated on activate/deactivate)
  {
    host: "coupons",
    pattern: /^\/app\/api\/v4\/promotionslist$/i,
    rule: { ttl: CACHE_TTL.liveList, shouldCache: (p) => Array.isArray(p?.sections) },
  },
  {
    host: "coupons",
    pattern: /^\/app\/api\/v4\/promotionslist\/anonymous$/i,
    rule: { ttl: CACHE_TTL.offers, shouldCache: (p) => Array.isArray(p?.sections) },
  },
  {
    host: "coupons",
    pattern: /^\/app\/api\/v4\/promotionsdetails\/[^/]+$/i,
    rule: { ttl: CACHE_TTL.offers, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  // Account & loyalty overview endpoints (short TTL)
  {
    host: "accounts",
    pattern: /^\/connect\/userinfo$/i,
    rule: { ttl: CACHE_TTL.liveList, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  {
    host: "profile",
    pattern: /^\/api\/v1\/[a-z]{2}\/loyalty$/i,
    rule: { ttl: CACHE_TTL.productDetail, shouldCache: (p) => p !== null && p !== undefined },
  },
  {
    host: "loyaltytab",
    pattern: /^\/api\/v2\/[a-z]{2}\/summary$/i,
    rule: { ttl: CACHE_TTL.liveList, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  {
    host: "stampcard",
    pattern: /^\/api\/v3\/[a-z]{2}\/user\/promotions$/i,
    rule: { ttl: CACHE_TTL.liveList, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  {
    host: "deposits",
    pattern: /^\/api\/v1\/[a-z]{2}\/deposits$/i,
    rule: { ttl: CACHE_TTL.liveList, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  {
    host: "couponplus",
    pattern: /^\/api\/v4\/[a-z]{2}\/user\/promotions$/i,
    rule: { ttl: CACHE_TTL.liveList, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  // Shop search & product detail
  {
    host: "shop",
    pattern: /^\/q\/api\/search$/i,
    rule: { ttl: CACHE_TTL.search, shouldCache: (p) => Array.isArray(p?.items) },
  },
  {
    host: "shop",
    pattern: /^\/p\/api\/detail\//i,
    rule: { ttl: CACHE_TTL.productDetail, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
  // Receipt overview list (short TTL; invalidated on favorite toggle) + immutable details/summaries
  {
    host: "tickets",
    pattern: /^\/api\/v3\/[a-z]{2}\/tickets$/i,
    rule: {
      ttl: CACHE_TTL.liveList,
      shouldCache: (p) => Array.isArray(p) || Array.isArray(p?.tickets),
    },
  },
  {
    host: "tickets",
    pattern: /^\/api\/v3\/[a-z]{2}\/tickets\/[^/]+(\/summary)?$/i,
    rule: { ttl: CACHE_TTL.receiptDetail, shouldCache: (p) => Boolean(p && typeof p === "object") },
  },
];

/**
 * Resolve the cache rule for a request, or `null` when it must stay live.
 */
export function cachePolicyFor(
  endpoint: string,
  options: RequestCacheInput
): CacheRule | null {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET") return null;
  if (endpoint.startsWith("http")) return null;

  for (const entry of REST_GET_CACHE_POLICIES) {
    if (entry.host && options.host && entry.host !== options.host) continue;
    if (entry.host && !options.host) continue;
    if (entry.pattern.test(endpoint)) {
      return entry.rule;
    }
  }
  return null;
}

/**
 * Compute a host-, country-, language-, and principal-scoped cache key.
 */
export function cacheKeyFor(
  baseUrl: string,
  endpoint: string,
  options: RequestCacheInput,
  scope: string
): string {
  const method = (options.method || "GET").toUpperCase();
  const country = (options.country || "").toLowerCase();
  const language = (options.language || "").toLowerCase();
  const reqHeaders = (options as any).headers as Record<string, string> | undefined;
  const extraHeaders =
    options.host === "stores" && reqHeaders?.storesIds
      ? { storesIds: reqHeaders.storesIds }
      : options.host === "coupons" && (reqHeaders?.["Store-Id"] || reqHeaders?.Zone)
        ? { storeId: reqHeaders["Store-Id"], zone: reqHeaders.Zone }
        : undefined;

  if (method === "GET") {
    const query = Object.entries(options.query ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(
        ([k, v]) =>
          [k, Array.isArray(v) ? v.map(String) : String(v)] as [
            string,
            string | string[],
          ]
      )
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return cacheKey(`${method} ${endpoint}`, [
      baseUrl,
      country,
      language,
      scope,
      query,
      extraHeaders,
    ]);
  }

  const body = options.body ?? {};
  return cacheKey(`${method} ${endpoint}`, [baseUrl, country, language, scope, body]);
}
