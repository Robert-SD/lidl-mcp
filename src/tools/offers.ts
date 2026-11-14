import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";
import {
  brochuresOutputSchema,
  campaignGroupsOutputSchema,
  campaignOffersOutputSchema,
  offerProductSchema,
  searchOffersOutputSchema,
  searchShopProductsOutputSchema,
  shopProductOutputSchema,
} from "./schemas.js";

export function registerOfferTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_get_brochures",
    {
      title: "Get Lidl Weekly Flyers & Brochures",
      description:
        "List active Lidl digital folders/brochures (with validity dates, web view URLs, and PDF download links) for NL or DE. Works without authentication.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        storeId: z.string().optional().describe("Optional store key (e.g. 'NL0135')."),
      }),
      outputSchema: brochuresOutputSchema,
    },
    withJsonTool(async (args) => {
      const brochures = await c.getBrochures(args);
      return { count: brochures.length, brochures };
    })
  );

  server.registerTool(
    "lidl_get_campaign_groups",
    {
      title: "Get Weekly Digital Leaflet Campaign Groups",
      description:
        "List active weekly digital leaflet campaign groups and campaigns (e.g. 'Aanbiedingen', 'Unsere Aktionsprospekte') for NL or DE. Works without authentication.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        storeId: z
          .string()
          .optional()
          .describe("Optional store key (e.g. 'NL0135' or 'DE0347') for local pricing/assortment."),
      }),
      outputSchema: campaignGroupsOutputSchema,
    },
    withJsonTool(async (args) => {
      const groups = await c.getCampaignGroups(args);
      return { count: groups.length, groups };
    })
  );

  server.registerTool(
    "lidl_get_campaign_offers",
    {
      title: "Get Products in a Digital Leaflet Campaign",
      description:
        "Fetch all discounted/featured products and prices inside a digital leaflet campaign ID for NL or DE. Works without authentication.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        campaignId: z
          .string()
          .min(1)
          .describe("Campaign ID from lidl_get_campaign_groups (e.g. '10008785')."),
        country: countryField,
        storeId: z.string().optional().describe("Optional store key (e.g. 'NL0135')."),
      }),
      outputSchema: campaignOffersOutputSchema,
    },
    withJsonTool((args) => c.getCampaignOffers(args))
  );

  server.registerTool(
    "lidl_search_offers",
    {
      title: "Search Weekly Lidl Leaflet Offers",
      description:
        "Search across active weekly digital leaflet campaigns for matching products and deals in NL or DE. Works without authentication.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Keyword to match against product title, subtitle, brand, or info (omit to list top active offers)."),
        country: countryField,
        storeId: z.string().optional().describe("Optional store key (e.g. 'NL0135' or 'DE0347')."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of offers to return (default 30, max 200)."),
      }),
      outputSchema: searchOffersOutputSchema,
    },
    withJsonTool((args) => c.searchOffers(args))
  );

  server.registerTool(
    "lidl_get_leaflet_product",
    {
      title: "Get Digital Leaflet Product Details",
      description:
        "Get detailed description, pricing, disclaimers, badges, and stock/ERP IDs for a digital leaflet product ID. Works without authentication.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        productId: z
          .string()
          .min(1)
          .describe("Leaflet product ID (e.g. '10008785_11563244')."),
        country: countryField,
        storeId: z.string().optional().describe("Optional store key (e.g. 'NL0135')."),
      }),
      outputSchema: offerProductSchema,
    },
    withJsonTool((args) => c.getLeafletProduct(args))
  );

  server.registerTool(
    "lidl_search_shop_products",
    {
      title: "Search Lidl Online Shop Products",
      description:
        "Search the Lidl online shop assortment (lidl.nl / lidl.de) by keyword and return matching products with prices, online availability, canonical URLs, and ERP numbers for lidl_get_shop_product. Works without authentication and is cached.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Search keyword for online shop products (e.g. 'boormachine', 'Parkside', 'airfryer')."),
        country: countryField,
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of products to return (default 20, max 50)."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Pagination offset (default 0)."),
      }),
      outputSchema: searchShopProductsOutputSchema,
    },
    withJsonTool((args) => c.searchShopProducts(args))
  );

  server.registerTool(
    "lidl_get_shop_product",
    {
      title: "Get Lidl Online Shop Product Details",
      description:
        "Fetch full Lidl online shop product details (title, pricing, specs, categories, canonical URL) by ERP product number for NL or DE. Works without authentication.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        productErp: z
          .string()
          .min(1)
          .describe("Lidl ERP product number (e.g. '100356883')."),
        country: countryField,
      }),
      outputSchema: shopProductOutputSchema,
    },
    withJsonTool((args) => c.getShopProduct(args))
  );
}
