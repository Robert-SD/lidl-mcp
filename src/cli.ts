import {
  getTokensFilePath,
  isApiConfigured,
  isAuthConfigured,
  loadTokens,
  loginCli,
  refreshTokens,
} from "./auth.js";
import { LidlClient } from "./client.js";

export async function showStatus(_client: LidlClient): Promise<void> {
  let tokens = await loadTokens();
  if (!tokens && process.env.LIDL_REFRESH_TOKEN && isAuthConfigured()) {
    try {
      tokens = await refreshTokens();
    } catch (error: any) {
      console.error(`⚠️ Bootstrap from refresh token failed: ${error.message}`);
    }
  }

  console.log("=".repeat(60));
  console.log("📋 LIDL (LIDL PLUS) MCP STATUS");
  console.log("=".repeat(60));
  console.log(`Token storage:  ${getTokensFilePath()}`);
  console.log(`Auth config:    ${isAuthConfigured() ? "✅ Configured" : "⏳ Pending endpoints"}`);
  console.log(`API base:       ${isApiConfigured() ? "✅ Configured" : "⏳ Pending endpoints"}`);

  if (!tokens) {
    console.log("⚠️ No user session found.");
    console.log("   Run 'npm run login' once Lidl OAuth endpoints are configured.");
  } else {
    console.log(`Access Token:   ${tokens.access_token ? "✅ Present" : "❌ Missing"}`);
    console.log(`Refresh Token:  ${tokens.refresh_token ? "✅ Active" : "❌ None"}`);
    console.log(`Last Saved:     ${tokens.saved_at || "Unknown"}`);
  }

  const cacheStats = _client.cacheStats();
  console.log(
    `Response cache: ${cacheStats.enabled ? "enabled" : "disabled"} — ` +
      `max ${cacheStats.maxEntries} entries.`
  );
}

export async function runCliCommand(
  args: string[],
  client: LidlClient
): Promise<boolean> {
  const cmd = args[0]?.toLowerCase();
  if (cmd === "login") {
    const manual = args.includes("--manual");
    const save = args.includes("--save");
    await loginCli({ manual, save });
    return true;
  }
  if (cmd === "status") {
    await showStatus(client);
    return true;
  }
  return false;
}
