export interface RequestOptions {
  method?: string;
  body?: any;
  query?: Record<string, any>;
  headers?: Record<string, string>;
}

export interface LidlTransport {
  request<T = any>(endpoint: string, options?: RequestOptions): Promise<T>;
  invalidateCache(prefix: string): void;
}
