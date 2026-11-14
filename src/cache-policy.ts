import { cacheKey } from "./cache.js";

/**
 * Cache TTLs in milliseconds. Only immutable or slow-moving upstream data is
 * cached — user state (profile, shopping lists, receipt overview) is
 * always fetched live unless explicitly safe to cache.
 */
export const CACHE_TTL = {
  /** Search results and promo prices: offers churn frequently. */
  search: 30 * 60 * 1000,
  /** Product detail: stable for a day. */
  productDetail: 24 * 60 * 60 * 1000,
  /** Categories, stores: near-static reference data. */
  catalog: 24 * 60 * 60 * 1000,
  /** Weekly offers and leaflets. */
  offers: 30 * 60 * 1000,
  /** Closed receipt details are immutable. */
  receiptDetail: 30 * 24 * 60 * 60 * 1000,
} as const;

export interface CacheRule {
  ttl: number;
  shouldCache?: (payload: any) => boolean;
}

export interface RequestCacheInput {
  method?: string;
  body?: any;
  query?: Record<string, any>;
}

// Ordered from most specific prefix to least specific.
// Populate as Lidl endpoints are added.
const REST_GET_CACHE_POLICIES: Array<{ prefix: string; rule: CacheRule }> = [];
const REST_POST_CACHE_POLICIES: Record<string, CacheRule> = {};

/**
 * Resolve the cache rule for a request, or `null` when it must stay live.
 */
export function cachePolicyFor(
  endpoint: string,
  options: RequestCacheInput
): CacheRule | null {
  const method = (options.method || "GET").toUpperCase();

  if (method !== "GET") {
    return REST_POST_CACHE_POLICIES[endpoint] ?? null;
  }

  if (endpoint.startsWith("http")) return null;

  for (const entry of REST_GET_CACHE_POLICIES) {
    if (endpoint.startsWith(entry.prefix)) {
      return entry.rule;
    }
  }
  return null;
}

/**
 * Compute a host- and principal-scoped cache key for an upstream request.
 */
export function cacheKeyFor(
  baseUrl: string,
  endpoint: string,
  options: RequestCacheInput,
  scope: string
): string {
  const method = (options.method || "GET").toUpperCase();

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
    return cacheKey(`${method} ${endpoint}`, [baseUrl, scope, query]);
  }

  const body = options.body ?? {};
  return cacheKey(`${method} ${endpoint}`, [baseUrl, scope, body]);
}
