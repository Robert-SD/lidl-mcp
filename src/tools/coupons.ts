import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";
import {
  couponActivationOutputSchema,
  couponDetailsOutputSchema,
  couponPlusOutputSchema,
  couponsOutputSchema,
} from "./schemas.js";

export function registerCouponTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_get_coupons",
    {
      title: "Get Lidl Plus Coupons & Promotions",
      description:
        "List active Lidl Plus coupons/promotions for NL or DE. Uses the authenticated member list when logged in, and falls back to public anonymous promotions otherwise.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        storeId: z.string().optional().describe("Optional store key (e.g. 'NL0135')."),
        zone: z.string().optional().describe("Optional offer zone (e.g. 'NL1')."),
      }),
      outputSchema: couponsOutputSchema,
    },
    withJsonTool((args) => c.getCoupons(args))
  );

  server.registerTool(
    "lidl_get_coupon_details",
    {
      title: "Get Lidl Plus Coupon Details",
      description:
        "Get detailed terms, validity, and articles for a specific Lidl Plus coupon/promotion UUID.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        promotionId: z.string().min(1).describe("Promotion UUID (promotionId)."),
        country: countryField,
      }),
      outputSchema: couponDetailsOutputSchema,
    },
    withJsonTool((args) => c.getCouponDetails(args))
  );

  server.registerTool(
    "lidl_activate_coupon",
    {
      title: "Activate a Lidl Plus Coupon",
      description:
        "Activate a Lidl Plus coupon for the selected country ('nl' or 'de') so it applies at checkout.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        promotionId: z
          .string()
          .min(1)
          .describe("Coupon/promotion UUID to activate."),
        country: countryField,
        actionLocation: z
          .string()
          .optional()
          .describe("Optional Action-Location header (defaults to 'CouponList')."),
      }),
      outputSchema: couponActivationOutputSchema,
    },
    withJsonTool((args) => c.activateCoupon(args))
  );

  server.registerTool(
    "lidl_deactivate_coupon",
    {
      title: "Deactivate a Lidl Plus Coupon",
      description:
        "Deactivate a previously activated Lidl Plus coupon for the selected country ('nl' or 'de').",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        promotionId: z
          .string()
          .min(1)
          .describe("Coupon/promotion UUID to deactivate."),
        country: countryField,
        actionLocation: z
          .string()
          .optional()
          .describe("Optional Action-Location header (defaults to 'CouponList')."),
      }),
      outputSchema: couponActivationOutputSchema,
    },
    withJsonTool((args) => c.deactivateCoupon(args))
  );

  server.registerTool(
    "lidl_get_coupon_plus",
    {
      title: "Get Coupon Plus Spend Goals",
      description:
        "Get active Lidl Coupon Plus spend milestones and reward progress for the selected country ('nl' or 'de').",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
      }),
      outputSchema: couponPlusOutputSchema,
    },
    withJsonTool(({ country }) => c.getCouponPlus(country))
  );
}
