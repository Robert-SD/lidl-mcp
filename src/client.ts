import {
  AUTH_CONFIG,
  HOST_CONFIG,
  authFetch,
  getAuthStatus,
  getOptionalAccessToken,
  getValidAccessToken,
  loadTokens,
} from "./auth.js";
import { CacheStats, TtlCache, cacheKey, getSharedCache } from "./cache.js";
import { CACHE_TTL, cacheKeyFor, cachePolicyFor } from "./cache-policy.js";
import { resolveCountry } from "./countries.js";
import { LidlApiError, normalizeToolError, type LidlErrorCode } from "./errors.js";
import { HostKey, LidlTransport, RequestOptions } from "./services/transport.js";
import * as coupons from "./services/coupons.js";
import * as loyalty from "./services/loyalty.js";
import * as offers from "./services/offers.js";
import * as planner from "./services/planner.js";
import * as stores from "./services/stores.js";
import * as tickets from "./services/tickets.js";
import {
  AuthSessionStatus,
  GroceryTripPlan,
  LidlBrochure,
  LidlCampaign,
  LidlCoupon,
  LidlOfferProduct,
  MemberProfile,
  Receipt,
  RegularProductsResult,
  StoreInfo,
} from "./types.js";

export { CACHE_TTL, LidlApiError, normalizeToolError };
export type { LidlErrorCode };

function extractJwtSubject(jwt: string | undefined): string | undefined {
  if (!jwt) return undefined;
  const parts = jwt.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    if (typeof payload?.sub === "string" && payload.sub) {
      return payload.sub;
    }
  } catch {
    // Opaque or malformed token
  }
  return undefined;
}

export class LidlClient {
  private readonly cache: TtlCache;
  private readonly hostOverrides: Partial<Record<HostKey, string>>;
  private lastAuthScope: string | null = null;
  readonly transport: LidlTransport;

  constructor(
    baseUrlOrOverrides?: string | Partial<Record<HostKey, string>>,
    cache?: TtlCache
  ) {
    if (typeof baseUrlOrOverrides === "string") {
      this.hostOverrides = baseUrlOrOverrides ? { stores: baseUrlOrOverrides } : {};
    } else {
      this.hostOverrides = baseUrlOrOverrides ?? {};
    }
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

  resolveBaseUrl(host: HostKey = "stores", country?: string): string {
    const override = this.hostOverrides[host];
    if (override) return override;
    if (host === "shop") {
      return resolveCountry(country).shopBaseUrl;
    }
    return HOST_CONFIG[host];
  }

  /**
   * Fingerprint of the principal in use so re-logins never serve another
   * account's cached responses.
   */
  private async authScope(authMode: RequestOptions["authMode"]): Promise<string> {
    if (authMode === "none") return "anonymous";
    const tokens = await loadTokens();
    const principal =
      extractJwtSubject(tokens?.id_token) ||
      extractJwtSubject(tokens?.access_token) ||
      tokens?.refresh_token ||
      tokens?.access_token;
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
    const host = options.host ?? "stores";
    const ctx = resolveCountry(options.country, options.language);
    const baseUrl = this.resolveBaseUrl(host, ctx.country);
    const authMode = options.authMode ?? "required";

    const policy = cachePolicyFor(endpoint, {
      ...options,
      host,
      country: ctx.country,
      language: ctx.language,
    });

    if (policy === null) {
      return await this.performRequest<T>(endpoint, {
        ...options,
        host,
        country: ctx.country,
        language: ctx.language,
      });
    }

    const token =
      authMode === "none"
        ? undefined
        : authMode === "optional"
          ? (await getOptionalAccessToken()) ?? undefined
          : await getValidAccessToken();
    const scope = await this.authScope(token ? authMode : "none");
    const key = cacheKeyFor(
      baseUrl,
      endpoint,
      {
        ...options,
        host,
        country: ctx.country,
        language: ctx.language,
      },
      scope
    );

    return await this.cache.wrap<T>(
      key,
      policy.ttl,
      () =>
        this.performRequest<T>(
          endpoint,
          {
            ...options,
            host,
            country: ctx.country,
            language: ctx.language,
          },
          token
        ),
      policy.shouldCache
    );
  }

  private async performRequest<T = any>(
    endpoint: string,
    options: RequestOptions = {},
    preResolvedToken?: string
  ): Promise<T> {
    const host = options.host ?? "stores";
    const ctx = resolveCountry(options.country, options.language);
    const baseUrl = this.resolveBaseUrl(host, ctx.country);
    const authMode = options.authMode ?? "required";

    let authToken = preResolvedToken;
    if (!authToken && authMode === "required") {
      authToken = await getValidAccessToken();
    } else if (!authToken && authMode === "optional") {
      authToken = (await getOptionalAccessToken()) ?? undefined;
    }

    const method = options.method || "GET";

    let urlStr = endpoint.startsWith("http")
      ? endpoint
      : `${baseUrl.replace(/\/+$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

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
      Accept: "application/json",
      "Accept-Language": ctx.language,
      ...(host !== "accounts" && host !== "shop"
        ? {
            "App-Version": AUTH_CONFIG.app_version,
            "Operating-System": AUTH_CONFIG.operating_system,
            "Sdk-Version": AUTH_CONFIG.sdk_version,
            Tenant: AUTH_CONFIG.tenant,
          }
        : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
      throw new LidlApiError(resp.status, errText);
    }

    const text = await resp.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  // 1. Account & Loyalty
  getProfile = (country?: string): Promise<MemberProfile> =>
    loyalty.getProfile(this.transport, country);

  getLoyaltyProgram = (country?: string, storeId?: string) =>
    loyalty.getLoyaltyProgram(this.transport, { country, storeId });

  /** @deprecated Use `getLoyaltyProgram` instead. */
  getLoyaltySummary = (country?: string, storeId?: string) =>
    loyalty.getLoyaltyProgram(this.transport, { country, storeId });

  // 2. Stores
  searchStores = (options?: {
    query?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    limit?: number;
  }): Promise<StoreInfo[]> => stores.searchStores(this.transport, options);

  getStoreDetails = (options: {
    storeId: string;
    date?: string;
    country?: string;
  }): Promise<StoreInfo> => stores.getStoreDetails(this.transport, options);

  getFavoriteStore = (country?: string): Promise<any> =>
    stores.getFavoriteStore(this.transport, country);

  setFavoriteStore = (storeId: string, country?: string): Promise<any> =>
    stores.setFavoriteStore(this.transport, storeId, country);

  // 3. Offers, Leaflets, Brochures & Shop Products
  getBrochures = (options?: {
    country?: string;
    storeId?: string;
  }): Promise<LidlBrochure[]> => offers.getBrochures(this.transport, options);

  getCampaignGroups = (options?: {
    country?: string;
    storeId?: string;
  }): Promise<Array<{ title: string; campaigns: LidlCampaign[] }>> =>
    offers.getCampaignGroups(this.transport, options);

  getCampaignOffers = (options: {
    campaignId: string;
    country?: string;
    storeId?: string;
  }): Promise<{
    id: string;
    title: string;
    subtitle?: string;
    products: LidlOfferProduct[];
  }> => offers.getCampaignOffers(this.transport, options);

  searchOffers = (options?: {
    query?: string;
    country?: string;
    storeId?: string;
    limit?: number;
  }): Promise<{
    country: string;
    storeId?: string;
    campaignsChecked: number;
    total: number;
    offers: LidlOfferProduct[];
  }> => offers.searchOffers(this.transport, options);

  getLeafletProduct = (options: {
    productId: string;
    country?: string;
    storeId?: string;
  }): Promise<LidlOfferProduct> => offers.getLeafletProduct(this.transport, options);

  getShopProduct = (options: {
    productErp: string;
    country?: string;
  }): Promise<any> => offers.getShopProduct(this.transport, options);

  // 4. Coupons & Promotions
  getCoupons = (options?: {
    country?: string;
    storeId?: string;
    zone?: string;
  }): Promise<{
    country: string;
    isAnonymousFallback: boolean;
    coupons: LidlCoupon[];
  }> => coupons.getCoupons(this.transport, options);

  getCouponDetails = (options: {
    promotionId: string;
    country?: string;
  }): Promise<any> => coupons.getCouponDetails(this.transport, options);

  activateCoupon = (options: {
    promotionId: string;
    country?: string;
    actionLocation?: string;
  }): Promise<any> => coupons.activateCoupon(this.transport, options);

  deactivateCoupon = (options: {
    promotionId: string;
    country?: string;
    actionLocation?: string;
  }): Promise<any> => coupons.deactivateCoupon(this.transport, options);

  getCouponPlus = (country?: string): Promise<any> =>
    coupons.getCouponPlus(this.transport, country);

  // 5. Receipts (Tickets)
  listReceipts = (options?: {
    country?: string;
    yearOffset?: number;
  }): Promise<Receipt[]> => tickets.listReceipts(this.transport, options);

  getReceiptDetails = (options: {
    ticketId: string;
    country?: string;
  }): Promise<Receipt> => tickets.getReceiptDetails(this.transport, options);

  getReceiptSummary = (options: {
    ticketId: string;
    country?: string;
  }): Promise<any> => tickets.getReceiptSummary(this.transport, options);

  setReceiptFavorite = (options: {
    ticketId: string;
    favorite: boolean;
    country?: string;
  }): Promise<any> => tickets.setReceiptFavorite(this.transport, options);

  // 6. Regular Products & Grocery Trip Planning (Per Country)
  getRegularProducts = (
    options?: planner.GetRegularProductsOptions
  ): Promise<RegularProductsResult> =>
    planner.getRegularProducts(this.transport, options);

  planGroceryTrip = (
    options?: planner.PlanGroceryTripOptions
  ): Promise<GroceryTripPlan> => planner.planGroceryTrip(this.transport, options);
}
