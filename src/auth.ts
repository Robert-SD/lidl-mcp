import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { exec } from "node:child_process";
import * as https from "node:https";
import { AuthSessionStatus, TokensData } from "./types.js";
import {
  LidlAuthError,
  getTokensFilePath,
  loadTokens,
  saveTokens,
  assertTokensPathWritable,
  resolveRefreshToken,
  getTokenStore,
  setTokenStore,
  TOKENS_FILE_ENV_VAR,
  TokenStore,
  FileTokenStore,
  MemoryTokenStore,
  HttpTokenStore,
} from "./token-store.js";

export * from "./token-store.js";

/**
 * Lidl Plus authentication & API configuration.
 * Populate `auth_base`, `api_base`, `client_id`, and `redirect_uri` once the
 * Lidl endpoints are wired in (or override via environment variables).
 */
export const AUTH_CONFIG = {
  auth_base: process.env.LIDL_AUTH_BASE || "",
  api_base: process.env.LIDL_API_BASE || "",
  client_id: process.env.LIDL_CLIENT_ID || "",
  redirect_uri: process.env.LIDL_REDIRECT_URI || "",
  authorize_path: "/connect/authorize",
  token_path: "/connect/token",
  scope: process.env.LIDL_OAUTH_SCOPE || "openid profile offline_access lpprofile lpapis",
  user_agent: process.env.LIDL_USER_AGENT || "LidlPlus/16.0.0",
  country: process.env.LIDL_COUNTRY || "NL",
  language: process.env.LIDL_LANGUAGE || "nl-NL",
};

export function isAuthConfigured(): boolean {
  return Boolean(
    AUTH_CONFIG.auth_base &&
      AUTH_CONFIG.client_id &&
      AUTH_CONFIG.redirect_uri
  );
}

export function isApiConfigured(): boolean {
  return Boolean(AUTH_CONFIG.api_base);
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(options?: {
  codeChallenge?: string;
  state?: string;
}): string {
  if (!isAuthConfigured()) {
    throw new LidlAuthError(
      "AUTH_NOT_CONFIGURED",
      "Lidl OAuth configuration is not set yet. Populate AUTH_CONFIG (or LIDL_AUTH_BASE, LIDL_CLIENT_ID, LIDL_REDIRECT_URI)."
    );
  }

  const params = new URLSearchParams({
    client_id: AUTH_CONFIG.client_id,
    redirect_uri: AUTH_CONFIG.redirect_uri,
    response_type: "code",
    scope: AUTH_CONFIG.scope,
  });
  if (options?.codeChallenge) {
    params.set("code_challenge", options.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  if (options?.state) {
    params.set("state", options.state);
  }
  const base = AUTH_CONFIG.auth_base.replace(/\/+$/, "");
  return `${base}${AUTH_CONFIG.authorize_path}?${params.toString()}`;
}

/**
 * Resilient fetch for Lidl API requests with mobile headers and curl/https fallback.
 */
export async function authFetch(
  urlStr: string,
  options: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }> {
  if (options.signal?.aborted) {
    throw options.signal.reason || new Error("The operation was aborted");
  }

  let lastErr: any = null;
  const mergedHeaders: Record<string, string> = {
    "User-Agent": AUTH_CONFIG.user_agent,
    "Accept-Language": AUTH_CONFIG.language,
    ...(options.headers || {}),
  };

  // 1. Try global fetch with transient error retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(urlStr, {
        method: options.method,
        headers: mergedHeaders,
        body: options.body,
        signal: options.signal,
      });
    } catch (err: any) {
      lastErr = err;
      if (options.signal?.aborted) {
        throw options.signal.reason || err;
      }
      const isEbadf =
        err?.message?.includes("EBADF") ||
        err?.cause?.code === "EBADF" ||
        err?.cause?.message?.includes("EBADF");
      if (isEbadf) break;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }

  if (options.signal?.aborted) {
    throw options.signal.reason || lastErr;
  }

  // 2. Try node:https with isolated agent
  try {
    return await new Promise((resolve, reject) => {
      const parsed = new URL(urlStr);
      const postData = options.body || "";
      const reqHeaders = {
        ...mergedHeaders,
        ...(postData ? { "Content-Length": String(Buffer.byteLength(postData)) } : {}),
      };

      const agent = new https.Agent({ keepAlive: false });
      const req = https.request(
        parsed,
        {
          method: options.method || "POST",
          headers: reqHeaders,
          agent,
          signal: options.signal,
        },
        (res) => {
          const chunks: Buffer[] = [];
          const onAbort = () => {
            res.destroy(options.signal?.reason || new Error("The operation was aborted"));
          };
          if (options.signal) {
            if (options.signal.aborted) {
              return reject(options.signal.reason || new Error("The operation was aborted"));
            }
            options.signal.addEventListener("abort", onAbort, { once: true });
          }

          res.on("data", (c) => chunks.push(c));
          res.on("error", (e) => {
            if (options.signal) {
              options.signal.removeEventListener("abort", onAbort);
            }
            reject(e);
          });
          res.on("end", () => {
            if (options.signal) {
              options.signal.removeEventListener("abort", onAbort);
            }
            const body = Buffer.concat(chunks).toString("utf-8");
            resolve({
              ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
              status: res.statusCode || 0,
              text: async () => body,
              json: async () => JSON.parse(body),
            });
          });
        }
      );
      req.on("error", (e) => reject(e));
      if (postData) req.write(postData);
      req.end();
    });
  } catch (httpsErr: any) {
    lastErr = httpsErr;
    if (options.signal?.aborted) {
      throw options.signal.reason || httpsErr;
    }
  }

  if (options.signal?.aborted) {
    throw options.signal.reason || lastErr;
  }

  // 3. Fallback to system curl
  try {
    const { execFile } = await import("node:child_process");
    return await new Promise((resolve, reject) => {
      const delimiter = "---HTTP_STATUS---";
      const args = [
        "-s",
        "-S",
        "-X",
        options.method || "POST",
        "-w",
        `${delimiter}%{http_code}`,
        urlStr,
      ];
      for (const [k, v] of Object.entries(mergedHeaders)) {
        args.push("-H", `${k}: ${v}`);
      }
      if (options.body) {
        args.push("-d", options.body);
      }
      execFile("curl", args, { signal: options.signal }, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`curl failed: ${err.message} (${stderr})`));
        }
        const idx = stdout.lastIndexOf(delimiter);
        const body = idx >= 0 ? stdout.slice(0, idx) : stdout;
        const statusStr = idx >= 0 ? stdout.slice(idx + delimiter.length).trim() : "0";
        const statusCode = parseInt(statusStr, 10) || 0;
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });
  } catch (curlErr: any) {
    throw lastErr || curlErr;
  }
}

export function extractAuthCode(codeOrUrl: string): string {
  const trimmed = codeOrUrl.trim();
  if (trimmed.includes("://") || trimmed.includes("?")) {
    try {
      const normalized = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "https://dummy/");
      const parsed = new URL(normalized);
      const code = parsed.searchParams.get("code");
      if (code) return code;
    } catch {
      // Fallback to raw value
    }
  }
  return trimmed;
}

export async function exchangeCode(
  codeOrUrl: string,
  opts: { save?: boolean; codeVerifier?: string } = {}
): Promise<TokensData> {
  if (!isAuthConfigured()) {
    throw new LidlAuthError(
      "AUTH_NOT_CONFIGURED",
      "Lidl OAuth configuration is not set yet. Populate AUTH_CONFIG before exchanging an authorization code."
    );
  }

  const code = extractAuthCode(codeOrUrl);
  const tokenUrl = `${AUTH_CONFIG.auth_base.replace(/\/+$/, "")}${AUTH_CONFIG.token_path}`;
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: AUTH_CONFIG.client_id,
    redirect_uri: AUTH_CONFIG.redirect_uri,
    code,
  });
  if (opts.codeVerifier) {
    form.set("code_verifier", opts.codeVerifier);
  }

  const resp = await authFetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new LidlAuthError(
      "TOKEN_EXCHANGE_FAILED",
      `Lidl token exchange failed (${resp.status}): ${errText}`
    );
  }

  const tokens = (await resp.json()) as TokensData;
  tokens.saved_at = new Date().toISOString();
  tokens.is_anonymous = false;

  if (opts.save) {
    await saveTokens(tokens);
  }

  return tokens;
}

let inflightRefresh: Promise<TokensData> | null = null;

export async function refreshTokens(existing?: TokensData): Promise<TokensData> {
  if (!isAuthConfigured()) {
    throw new LidlAuthError(
      "AUTH_NOT_CONFIGURED",
      "Lidl OAuth configuration is not set yet. Populate AUTH_CONFIG before refreshing tokens."
    );
  }

  const store = getTokenStore();
  const initialTokens = existing || (await loadTokens());
  const initialRefreshToken = initialTokens?.refresh_token;
  const initialSavedAt = initialTokens?.saved_at;

  const doRefresh = async (ctx?: { waited?: boolean }): Promise<TokensData> => {
    const tokens = (await loadTokens()) || initialTokens || null;
    const { token: rToken } = resolveRefreshToken(tokens);

    if (ctx?.waited) {
      const tokenChanged = Boolean(
        tokens &&
          ((initialRefreshToken && tokens.refresh_token !== initialRefreshToken) ||
            (initialSavedAt && tokens.saved_at !== initialSavedAt))
      );
      if (tokenChanged && tokens?.access_token) {
        return tokens;
      }
    }

    if (!rToken) {
      throw new LidlAuthError(
        "MISSING_REFRESH_TOKEN",
        `No Lidl refresh_token is available (nothing in ${getTokensFilePath()} and no ` +
          `LIDL_REFRESH_TOKEN is set). Run 'lidl-mcp login' to authenticate.`
      );
    }

    await assertTokensPathWritable();

    const tokenUrl = `${AUTH_CONFIG.auth_base.replace(/\/+$/, "")}${AUTH_CONFIG.token_path}`;
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: AUTH_CONFIG.client_id,
      refresh_token: rToken,
    });

    const resp = await authFetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new LidlAuthError(
        "TOKEN_REFRESH_FAILED",
        `Lidl token refresh failed (${resp.status}): ${errText}`
      );
    }

    const refreshed = (await resp.json()) as TokensData;
    refreshed.saved_at = new Date().toISOString();
    refreshed.is_anonymous = false;

    if (!refreshed.refresh_token) {
      refreshed.refresh_token = rToken;
    }

    await saveTokens(refreshed);
    return refreshed;
  };

  if (store.withLock) {
    return await store.withLock(doRefresh);
  }

  if (!inflightRefresh) {
    inflightRefresh = doRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return await inflightRefresh;
}

export async function getValidAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  let accessToken = tokens?.access_token;
  const { token: refreshToken } = resolveRefreshToken(tokens);

  if (!accessToken && !refreshToken) {
    throw new LidlAuthError(
      "UNAUTHENTICATED",
      `No Lidl session found (${getTokensFilePath()}). Run 'lidl-mcp login' to authenticate.`
    );
  }

  let shouldRefresh = false;
  if (!accessToken) {
    shouldRefresh = true;
  } else if (tokens?.saved_at) {
    try {
      const savedAt = new Date(tokens.saved_at).getTime();
      const ageSec = (Date.now() - savedAt) / 1000;
      const expiresIn = tokens.expires_in || 3600;
      if (ageSec > expiresIn - 300) {
        shouldRefresh = true;
      }
    } catch {
      // Ignore invalid date
    }
  }

  if (shouldRefresh && refreshToken && isAuthConfigured()) {
    try {
      const fresh = await refreshTokens(tokens || undefined);
      accessToken = fresh.access_token;
    } catch (err) {
      if (!accessToken) throw err;
    }
  }

  if (!accessToken) {
    throw new LidlAuthError(
      "UNAUTHENTICATED",
      "No valid Lidl access token is available. Run 'lidl-mcp login' to authenticate."
    );
  }

  return accessToken;
}

export async function getAuthStatus(): Promise<AuthSessionStatus> {
  const tokens = await loadTokens();
  const { token: refreshToken } = resolveRefreshToken(tokens);
  return {
    authenticated: Boolean(tokens?.access_token || refreshToken),
    hasAccessToken: Boolean(tokens?.access_token),
    hasRefreshToken: Boolean(refreshToken),
    savedAt: tokens?.saved_at,
    tokensFile: getTokensFilePath(),
    configured: isAuthConfigured() && isApiConfigured(),
  };
}

let stealthConfigured = false;

export async function loginWithBrowser(
  url: string
): Promise<{ redirectUrl: string; close: () => Promise<void> } | null> {
  let chromium: any;
  try {
    const pwe = await import("playwright-extra");
    const stealthMod = await import("puppeteer-extra-plugin-stealth");
    const stealth = (stealthMod as any).default || stealthMod;
    chromium = pwe.chromium;
    if (!stealthConfigured) {
      chromium.use(stealth());
      stealthConfigured = true;
    }
  } catch {
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      return null;
    }
  }

  const profileDir = path.join(os.homedir(), ".config", "lidl-mcp", "browser_profile");
  try {
    fs.mkdirSync(profileDir, { recursive: true });
  } catch {
    // Ignore
  }

  const isHeadless = process.env.LIDL_HEADLESS === "true" || process.env.CI === "true";

  const launchOptions = {
    headless: isHeadless,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-sandbox",
    ],
    viewport: { width: 1280, height: 800 },
  };

  let context: any = null;
  try {
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        channel: "chrome",
        ...launchOptions,
      });
    } catch {
      context = await chromium.launchPersistentContext(profileDir, launchOptions);
    }

    const page = context.pages()[0] || (await context.newPage());

    console.log("\n🌐 Opening Lidl login in Chrome...");
    console.log("👉 Please sign in to your Lidl account in the browser window.");
    console.log("   (Your redirect callback will be captured automatically — no copy/paste needed!)\n");

    return await new Promise<{ redirectUrl: string; close: () => Promise<void> } | null>((resolve) => {
      let resolved = false;

      const closeHandler = async () => {
        try {
          await context?.close();
        } catch {
          // Ignore
        }
      };

      const handleUrl = (targetUrl: string) => {
        if (
          !resolved &&
          AUTH_CONFIG.redirect_uri &&
          targetUrl.startsWith(AUTH_CONFIG.redirect_uri)
        ) {
          resolved = true;
          console.log("⚡ Captured Lidl OAuth redirect callback automatically!");
          resolve({ redirectUrl: targetUrl, close: closeHandler });
        }
      };

      page.on("request", (req: any) => handleUrl(req.url()));
      page.on("requestfailed", (req: any) => handleUrl(req.url()));
      page.on("framenavigated", (frame: any) => {
        if (frame === page.mainFrame()) {
          handleUrl(frame.url());
        }
      });

      page.on("close", () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      page.goto(url).catch(() => {});
    });
  } catch (err) {
    console.warn(`Browser automation failed to launch: ${(err as Error).message}`);
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignore
      }
    }
    return null;
  }
}

function openInSystemBrowser(url: string) {
  const platform = process.platform;
  if (platform === "darwin") {
    exec(`open "${url}"`);
  } else if (platform === "win32") {
    exec(`start "" "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

export async function loginCli(opts: { manual?: boolean; save?: boolean } = {}): Promise<void> {
  if (!isAuthConfigured()) {
    console.error("❌ Lidl OAuth endpoints are not configured yet.");
    console.error("   Populate AUTH_CONFIG in src/auth.ts (or set LIDL_AUTH_BASE, LIDL_CLIENT_ID, LIDL_REDIRECT_URI).");
    process.exit(1);
  }

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = buildAuthorizeUrl({ codeChallenge, state });

  console.log("=".repeat(60));
  console.log("🔐 LIDL (LIDL PLUS) MCP LOGIN");
  console.log("=".repeat(60));

  let capturedUrl: string | null = null;
  let browserHandle: { redirectUrl: string; close: () => Promise<void> } | null = null;

  if (!opts.manual) {
    try {
      browserHandle = await loginWithBrowser(authUrl);
      if (browserHandle) {
        capturedUrl = browserHandle.redirectUrl;
      }
    } catch {
      // Fallback to manual
    }
  }

  let codeToExchange = "";

  if (capturedUrl) {
    codeToExchange = capturedUrl;
  } else {
    console.log("\n1. Open this URL in your browser to sign in to Lidl:\n");
    console.log(`   ${authUrl}\n`);
    openInSystemBrowser(authUrl);

    console.log(`2. After signing in, copy the redirect URL (${AUTH_CONFIG.redirect_uri}?code=...) or code parameter.\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await rl.question("Paste the redirect URL or code here: ");
    rl.close();
    codeToExchange = answer.trim();
  }

  if (!codeToExchange) {
    console.error("❌ No code provided. Login aborted.");
    if (browserHandle) await browserHandle.close();
    process.exit(1);
  }

  console.log("\nExchanging authorization code with Lidl...");
  try {
    const tokens = await exchangeCode(codeToExchange, { save: true, codeVerifier });
    console.log("✅ Successfully authenticated with Lidl!");
    console.log(`📁 Tokens saved to: ${getTokensFilePath()}`);
    console.log(`🔑 Refresh Token: ${tokens.refresh_token ? "Active" : "None"}`);
  } catch (err: any) {
    console.error(`❌ Authentication failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (browserHandle) {
      await browserHandle.close();
    }
  }
}
