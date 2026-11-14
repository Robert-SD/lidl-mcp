import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";

export function registerStoreTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_search_stores",
    {
      title: "Search Lidl Stores",
      description:
        "Search Lidl stores in NL or DE by city, postal code, street, storeKey (e.g. 'NL0135', 'DE0347'), or coordinates. Works without authentication and is cached.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        query: z
          .string()
          .optional()
          .describe("City, postal code, address, or storeKey (e.g. 'Amsterdam', '1074 BJ', 'Berlin')."),
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
    },
    withJsonTool((args) => c.searchStores(args))
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
          .describe("Lidl store key (e.g. 'NL0135' or 'DE0347')."),
        country: countryField,
        date: z
          .string()
          .optional()
          .describe("Date for opening hours in YYYY-MM-DD format (defaults to today)."),
      }),
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
    },
    withJsonTool(({ country }) => c.getFavoriteStore(country))
  );

  server.registerTool(
    "lidl_set_favorite_store",
    {
      title: "Set Favorite Lidl Store",
      description:
        "Set the authenticated user's favorite Lidl store for the selected country ('nl' or 'de').",
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: z.object({
        storeKey: z
          .string()
          .min(1)
          .describe("Store key to set as favorite (e.g. 'NL0135' or 'DE0347')."),
        country: countryField,
      }),
    },
    withJsonTool(({ storeKey, country }) => c.setFavoriteStore(storeKey, country))
  );
}
