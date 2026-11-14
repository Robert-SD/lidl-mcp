import {
  AUTH_CONFIG,
  LidlAuthError,
  authFetch,
  getAuthStatus,
  getValidAccessToken,
  loadTokens,
} from "./auth.js";
import { CacheStats, TtlCache, cacheKey, getSharedCache } from "./cache.js";
import { CACHE_TTL, cacheKeyFor, cachePolicyFor } from "./cache-policy.js";
import { LidlTransport, RequestOptions } from "./services/transport.js";
import { AuthSessionStatus } from "./types.js";

export { CACHE_TTL };

export class LidlClient {
  private readonly baseUrl: string;
  private readonly cache: TtlCache;
  private lastAuthScope: string | null = null;
  readonly transport: LidlTransport;

  constructor(baseUrl: string = AUTH_CONFIG.api_base, cache?: TtlCache) {
    this.baseUrl = baseUrl;
    this.cache = cache ?? getSharedCache();
    this.transport = {
      request: (endpoint, options) => this.request(endpoint, options),
      invalidateCache: (prefix) => this.cache.invalidate(prefix),
    };
  }

  cacheStats(): CacheStats {
    return this.cache.stats();
  }

  async getAuthStatus(): Promise<AuthSessionStatus> {
    return getAuthStatus();
  }

  /**
   * Fingerprint of the principal in use so re-logins never serve another
   * account's cached responses.
   */
  private async authScope(): Promise<string> {
    const tokens = await loadTokens();
    const principal = tokens?.refresh_token || tokens?.access_token;
    const scope = principal
      ? cacheKey("auth", [principal]).split(" ").pop()!
      : "anonymous";
    if (this.lastAuthScope !== null && this.lastAuthScope !== scope) {
      this.cache.clear();
    }
    this.lastAuthScope = scope;
    return scope;
  }

  async request<T = any>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const policy = cachePolicyFor(endpoint, options);
    if (policy === null) {
      return await this.performRequest<T>(endpoint, options);
    }

    const token = await getValidAccessToken();
    const scope = await this.authScope();
    const key = cacheKeyFor(this.baseUrl, endpoint, options, scope);
    return await this.cache.wrap<T>(
      key,
      policy.ttl,
      () => this.performRequest<T>(endpoint, options, token),
      policy.shouldCache
    );
  }

  private async performRequest<T = any>(
    endpoint: string,
    options: RequestOptions = {},
    token?: string
  ): Promise<T> {
    if (!endpoint.startsWith("http") && !this.baseUrl) {
      throw new LidlAuthError(
        "API_NOT_CONFIGURED",
        "Lidl API base URL is not configured yet. Populate AUTH_CONFIG.api_base or pass a baseUrl to LidlClient."
      );
    }

    const authToken = token ?? (await getValidAccessToken());
    const method = options.method || "GET";

    let urlStr = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl.replace(/\/+$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    if (options.query) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item !== undefined && item !== null && item !== "") {
              sp.append(k, String(item));
            }
          }
        } else if (v !== undefined && v !== null && v !== "") {
          sp.set(k, String(v));
        }
      }
      const qs = sp.toString();
      if (qs) {
        urlStr += (urlStr.includes("?") ? "&" : "?") + qs;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/json",
      ...(options.headers || {}),
    };

    let bodyStr: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      bodyStr =
        typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
    }

    const resp = await authFetch(urlStr, {
      method,
      headers,
      body: bodyStr,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      const err = new Error(
        `Lidl API error (${resp.status}) at ${endpoint}: ${errText}`
      );
      (err as any).status = resp.status;
      throw err;
    }

    const text = await resp.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
