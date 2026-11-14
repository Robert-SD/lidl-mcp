import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";
import {
  cacheStatsOutputSchema,
  loginOutputSchema,
  loyaltyProgramOutputSchema,
  memberProfileSchema,
} from "./schemas.js";

export function registerAccountTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_login",
    {
      title: "Check or Refresh Lidl Login Session",
      description:
        "Check authentication status, refresh an expired access token if a refresh token is persisted, and fetch live member identity when authenticated.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        country: countryField,
      }),
      outputSchema: loginOutputSchema,
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
      outputSchema: memberProfileSchema,
    },
    withJsonTool(({ country }) => c.getProfile(country))
  );

  server.registerTool(
    "lidl_get_loyalty_program",
    {
      title: "Get Lidl Plus Loyalty Program (Card, Stampcards & Deposits)",
      description:
        "Fetch Lidl Plus loyalty program status/points summary, active stampcards, and bottle deposit balances for the selected country ('nl' or 'de').",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        storeId: z
          .string()
          .optional()
          .describe("Optional store ID (e.g. 'NL0135' or 'DE0347') for stampcards."),
      }),
      outputSchema: loyaltyProgramOutputSchema,
    },
    withJsonTool(({ country, storeId }) => c.getLoyaltyProgram(country, storeId))
  );

  server.registerTool(
    "lidl_cache_stats",
    {
      title: "Get Response Cache Statistics",
      description:
        "Report the process-scoped in-memory response cache: enabled state, scope, hits, misses, hit rate, stored entries, and evictions.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({}),
      outputSchema: cacheStatsOutputSchema,
    },
    withJsonTool(async () => c.cacheStats())
  );
}
