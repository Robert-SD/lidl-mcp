import {
  getTokensFilePath,
  isApiConfigured,
  isAuthConfigured,
  loadTokens,
  loginCli,
  refreshTokens,
} from "./auth.js";
import { LidlClient } from "./client.js";
import { resolveCountry } from "./countries.js";

export async function showStatus(client: LidlClient): Promise<void> {
  let tokens = await loadTokens();
  if (!tokens && process.env.LIDL_REFRESH_TOKEN && isAuthConfigured()) {
    try {
      tokens = await refreshTokens();
    } catch (error: any) {
      console.error(`⚠️ Bootstrap from refresh token failed: ${error.message}`);
    }
  }

  const ctx = resolveCountry();

  console.log("=".repeat(60));
  console.log("📋 LIDL (LIDL PLUS) MCP STATUS");
  console.log("=".repeat(60));
  console.log(`Token storage:   ${getTokensFilePath()}`);
  console.log(`Default country: ${ctx.isoCountryCode} (language: ${ctx.language})`);
  console.log(`Auth config:     ${isAuthConfigured() ? "✅ Configured" : "❌ Missing"}`);
  console.log(`API hosts:       ${isApiConfigured() ? "✅ Configured" : "❌ Missing"}`);

  if (!tokens) {
    console.log("⚠️ No user session found. Public endpoints (stores, leaflets, brochures) work anonymously.");
    console.log("   Run 'npm run login' to connect your personal Lidl Plus account.");
  } else {
    console.log(`Access Token:    ${tokens.access_token ? "✅ Present" : "❌ Missing"}`);
    console.log(`Refresh Token:   ${tokens.refresh_token ? "✅ Active" : "❌ None"}`);
    console.log(`Last Saved:      ${tokens.saved_at || "Unknown"}`);
  }

  const cacheStats = client.cacheStats();
  console.log(
    `Response cache:  ${cacheStats.enabled ? "enabled" : "disabled"} — ` +
      `max ${cacheStats.maxEntries} entries.`
  );

  console.log("\nVerifying live API connection...");
  try {
    const stores = await client.searchStores({ country: ctx.country, limit: 1 });
    console.log(
      `✅ Stores API operational (${ctx.isoCountryCode} sample: ${stores[0]?.storeKey || "ok"} ${stores[0]?.name || ""})`
    );
  } catch (err: any) {
    console.log(`❌ Public API check failed: ${err.message}`);
  }

  if (tokens) {
    try {
      const prof = await client.getProfile(ctx.country);
      console.log(`Customer Name:   ${prof.name || prof.email || "Authenticated"}`);
      if (prof.loyaltyCardNumber) {
        console.log(`Loyalty Card:    ${prof.loyaltyCardNumber}`);
      }
      console.log("✅ Authenticated connection healthy!");
    } catch (err: any) {
      console.log(`⚠️ Authenticated profile check note: ${err.message}`);
    }
  }
}

export async function runCliCommand(
  args: string[],
  client: LidlClient
): Promise<boolean> {
  const cmd = args[0]?.toLowerCase();
  if (cmd === "login") {
    const manual = args.includes("--manual");
    const save = args.includes("--save");
    const countryArg = args.find((a) => a.startsWith("--country="))?.split("=")[1];
    await loginCli({ manual, save, country: countryArg });
    return true;
  }
  if (cmd === "status") {
    await showStatus(client);
    return true;
  }
  return false;
}
