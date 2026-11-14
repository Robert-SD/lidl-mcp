import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";

export function registerAccountTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_login",
    {
      title: "Check Lidl Login Status",
      description:
        "Check authentication status, token persistence path, default country/language, and live member identity if authenticated.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
      }),
    },
    withJsonTool(async ({ country }) => {
      const status = await c.getAuthStatus();
      if (!status.authenticated) {
        return { status: "unauthenticated", ...status };
      }
      try {
        const profile = await c.getProfile(country);
        return {
          status: "authenticated",
          ...status,
          profile,
        };
      } catch (err: any) {
        return {
          status: "token_present",
          ...status,
          profileError: err?.message,
        };
      }
    })
  );

  server.registerTool(
    "lidl_get_profile",
    {
      title: "Get Lidl Plus Member Profile",
      description:
        "Get Lidl Accounts user info (name, email) and Lidl Plus loyalty card details for the selected country ('nl' or 'de').",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
      }),
    },
    withJsonTool(({ country }) => c.getProfile(country))
  );

  server.registerTool(
    "lidl_get_loyalty_summary",
    {
      title: "Get Lidl Plus Loyalty Summary, Stampcards & Deposits",
      description:
        "Fetch loyalty summary/points, active stampcards, and bottle deposit balances for the selected country ('nl' or 'de').",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        storeId: z
          .string()
          .optional()
          .describe("Optional store key (e.g. 'NL0135' or 'DE0347') for stampcards."),
      }),
    },
    withJsonTool(({ country, storeId }) => c.getLoyaltySummary(country, storeId))
  );

  server.registerTool(
    "lidl_cache_stats",
    {
      title: "Get Response Cache Statistics",
      description:
        "Report the in-process response cache: enabled state, hits, misses, hit rate, stored entries, and evictions.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({}),
    },
    withJsonTool(async () => c.cacheStats())
  );
}
