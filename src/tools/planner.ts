import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";
import {
  groceryTripPlanOutputSchema,
  regularProductsOutputSchema,
} from "./schemas.js";

export function registerPlannerTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_get_regular_products",
    {
      title: "Analyze Regular Lidl Purchases",
      description:
        "Analyze past digital receipts for a single country ('nl' or 'de') to identify regularly purchased items, average prices, purchase cadence, and restock candidates. Reuses the 30-day in-memory receipt cache.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        minPurchases: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Minimum number of receipts an item must appear on (default 2)."),
        maxReceipts: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Maximum recent receipts to scan (default 25, max 60)."),
        daysBack: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Optional lookback window in days."),
        yearOffset: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .describe("Optional receipt year offset (0 = current year, 1 = previous year)."),
        excludeDeposits: z
          .boolean()
          .optional()
          .describe("Exclude bottle/crate deposits like Pfand / Statiegeld (default true)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of regular products to return (default 50)."),
      }),
      outputSchema: regularProductsOutputSchema,
    },
    withJsonTool((args) => c.getRegularProducts(args))
  );

  server.registerTool(
    "lidl_plan_grocery_trip",
    {
      title: "Plan Lidl Grocery Trip (Per Country)",
      description:
        "Plan a grocery trip for one country ('nl' or 'de') by matching regularly bought receipt items and optional extra items against active weekly leaflet offers and Lidl Plus coupons, surfacing unactivated coupons and due-for-restock staples.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        storeId: z
          .string()
          .optional()
          .describe("Optional store key (auto-resolves your favorite store for the selected country if omitted)."),
        extraItems: z
          .array(z.string().min(1))
          .max(30)
          .optional()
          .describe("Optional additional items to check for weekly discounts or coupons this trip."),
        minPurchases: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Minimum number of receipts an item must appear on to count as regular (default 2)."),
        maxReceipts: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Maximum recent receipts to inspect (default 25, max 60)."),
        daysBack: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Optional lookback window in days."),
        yearOffset: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .describe("Optional receipt year offset."),
        excludeDeposits: z
          .boolean()
          .optional()
          .describe("Exclude Pfand / Statiegeld lines (default true)."),
        maxMatchesPerItem: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Maximum matching offers/coupons per item (default 3)."),
      }),
      outputSchema: groceryTripPlanOutputSchema,
    },
    withJsonTool((args) => c.planGroceryTrip(args))
  );
}
