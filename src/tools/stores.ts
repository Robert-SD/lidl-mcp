import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";
import {
  favoriteStoreOutputSchema,
  searchStoresOutputSchema,
  setFavoriteStoreOutputSchema,
  storeInfoSchema,
} from "./schemas.js";

export function registerStoreTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_search_stores",
    {
      title: "Search Lidl Stores",
      description:
        "Search Lidl stores in NL or DE by city, postal code, street, storeId/storeKey (e.g. 'NL0135', 'DE0347'), or coordinates. Works without authentication and is cached.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        query: z
          .string()
          .optional()
          .describe("City, postal code, address, or store ID/key (e.g. 'Amsterdam', '1074 BJ', 'Berlin')."),
        latitude: z
          .number()
          .optional()
          .describe("Optional latitude for nearest-store lookup (requires longitude)."),
        longitude: z
          .number()
          .optional()
          .describe("Optional longitude for nearest-store lookup (requires latitude)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of stores to return (default 20, max 100)."),
      }),
      outputSchema: searchStoresOutputSchema,
    },
    withJsonTool(async (args) => {
      const stores = await c.searchStores(args);
      return { count: stores.length, stores };
    })
  );

  server.registerTool(
    "lidl_get_store_details",
    {
      title: "Get Lidl Store Details & Opening Hours",
      description:
        "Get detailed Lidl store info (zone, offer region, amenities, coordinates) and opening hours for a given date. Works without authentication.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        storeId: z
          .string()
          .min(1)
          .describe("Lidl store ID/key (e.g. 'NL0135' or 'DE0347')."),
        country: countryField,
        date: z
          .string()
          .optional()
          .describe("Date for opening hours in YYYY-MM-DD format (defaults to today)."),
      }),
      outputSchema: storeInfoSchema,
    },
    withJsonTool((args) => c.getStoreDetails(args))
  );

  server.registerTool(
    "lidl_get_favorite_store",
    {
      title: "Get Favorite Lidl Store",
      description:
        "Get the authenticated user's favorite Lidl store for the selected country ('nl' or 'de').",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
      }),
      outputSchema: favoriteStoreOutputSchema,
    },
    withJsonTool(async ({ country }) => (await c.getFavoriteStore(country)) ?? { storeKey: null })
  );

  server.registerTool(
    "lidl_set_favorite_store",
    {
      title: "Set Favorite Lidl Store",
      description:
        "Set the authenticated user's favorite Lidl store for the selected country ('nl' or 'de').",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        storeId: z
          .string()
          .min(1)
          .describe("Lidl store ID/key to set as favorite (e.g. 'NL0135' or 'DE0347')."),
        country: countryField,
      }),
      outputSchema: setFavoriteStoreOutputSchema,
    },
    withJsonTool(({ storeId, country }) => c.setFavoriteStore(storeId, country))
  );
}
