import { LidlAuthError } from "./token-store.js";

export type LidlErrorCode =
  | "not_found"
  | "auth_expired"
  | "unauthenticated"
  | "forbidden"
  | "rate_limited"
  | "bad_request"
  | "upstream_error"
  | "network_error";

export interface StructuredToolError {
  code: LidlErrorCode;
  message: string;
  status?: number;
}

export function httpStatusToErrorCode(status: number): LidlErrorCode {
  if (status === 404) return "not_found";
  if (status === 401) return "auth_expired";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "bad_request";
  return "upstream_error";
}

function extractBodyMessage(rawBody: string): string | undefined {
  const trimmed = rawBody.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    const candidate =
      parsed?.detail ||
      parsed?.title ||
      parsed?.message ||
      parsed?.error_description ||
      parsed?.error;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  } catch {
    // Plain text / HTML fallback below
  }
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}...` : trimmed;
}

/**
 * Structured error raised when a Lidl HTTP API call returns a non-2xx response.
 */
export class LidlApiError extends Error {
  readonly code: LidlErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, rawBody = "", fallbackMessage?: string) {
    const detail = extractBodyMessage(rawBody);
    const code = httpStatusToErrorCode(status);
    const message = detail || fallbackMessage || `Lidl API request failed with HTTP ${status}`;
    super(message);
    this.name = "LidlApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const NETWORK_ERROR_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function authErrorCodeToTaxonomy(code: string): LidlErrorCode {
  if (
    code === "not_logged_in" ||
    code === "unauthenticated" ||
    code === "tokens_missing" ||
    code === "anonymous_only"
  ) {
    return "unauthenticated";
  }
  if (
    code === "refresh_failed" ||
    code === "token_expired" ||
    code === "invalid_grant" ||
    code === "unauthorized"
  ) {
    return "auth_expired";
  }
  return "auth_expired";
}

/**
 * Convert any thrown error into a consistent machine-readable taxonomy payload
 * for MCP tool error responses.
 */
export function normalizeToolError(error: unknown): StructuredToolError {
  if (error instanceof LidlApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  if (error instanceof LidlAuthError) {
    return {
      code: authErrorCodeToTaxonomy(error.code),
      message: error.message,
    };
  }

  const errObj = error as any;
  const status = typeof errObj?.status === "number" ? errObj.status : undefined;
  if (status !== undefined) {
    return {
      code: httpStatusToErrorCode(status),
      message:
        typeof errObj?.message === "string" && errObj.message
          ? errObj.message
          : `Request failed with HTTP ${status}`,
      status,
    };
  }

  const sysCode = typeof errObj?.code === "string" ? errObj.code : "";
  const causeCode = typeof errObj?.cause?.code === "string" ? errObj.cause.code : "";
  const msg =
    typeof errObj?.message === "string" && errObj.message
      ? errObj.message
      : String(error || "Unknown error");

  if (
    NETWORK_ERROR_CODES.has(sysCode) ||
    NETWORK_ERROR_CODES.has(causeCode) ||
    error instanceof TypeError ||
    /\b(fetch failed|network|timed out|ECONN|ENOTFOUND)\b/i.test(msg)
  ) {
    return {
      code: "network_error",
      message: msg,
    };
  }

  if (/\b(not authenticated|not logged in|no tokens?|login required)\b/i.test(msg)) {
    return {
      code: "unauthenticated",
      message: msg,
    };
  }

  return {
    code: "upstream_error",
    message: msg,
  };
}
