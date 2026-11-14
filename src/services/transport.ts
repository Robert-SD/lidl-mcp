export type HostKey =
  | "accounts"
  | "coupons"
  | "tickets"
  | "stores"
  | "profile"
  | "home"
  | "leaflet"
  | "brochures"
  | "loyaltytab"
  | "stampcard"
  | "deposits"
  | "couponplus"
  | "shop";

export type AuthMode = "required" | "optional" | "none";

export interface RequestOptions {
  host?: HostKey;
  country?: string;
  language?: string;
  method?: string;
  body?: any;
  query?: Record<string, any>;
  headers?: Record<string, string>;
  authMode?: AuthMode;
}

export interface LidlTransport {
  request<T = any>(endpoint: string, options?: RequestOptions): Promise<T>;
  invalidateCache(prefix: string): void;
}
