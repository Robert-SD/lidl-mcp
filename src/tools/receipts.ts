import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { countryField, withJsonTool } from "./helpers.js";

export function registerReceiptTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_list_receipts",
    {
      title: "List Lidl Digital Receipts",
      description:
        "List past digital receipts (kassabonnen / Kassenbons) for the authenticated user in NL or DE.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        country: countryField,
        yearOffset: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .describe("Optional year offset (0 = current year, 1 = previous year, etc.)."),
      }),
    },
    withJsonTool((args) => c.listReceipts(args))
  );

  server.registerTool(
    "lidl_get_receipt_details",
    {
      title: "Get Lidl Receipt Details",
      description:
        "Get full itemized digital receipt details (line items, prices, discounts, store) by ticket ID. Cached for 30 days.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        ticketId: z.string().min(1).describe("Receipt/ticket ID from lidl_list_receipts."),
        country: countryField,
      }),
    },
    withJsonTool((args) => c.getReceiptDetails(args))
  );

  server.registerTool(
    "lidl_get_receipt_summary",
    {
      title: "Get Lidl Receipt Summary",
      description:
        "Get receipt summary/savings breakdown by ticket ID. Cached for 30 days.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        ticketId: z.string().min(1).describe("Receipt/ticket ID from lidl_list_receipts."),
        country: countryField,
      }),
    },
    withJsonTool((args) => c.getReceiptSummary(args))
  );

  server.registerTool(
    "lidl_set_receipt_favorite",
    {
      title: "Favorite or Unfavorite a Lidl Receipt",
      description:
        "Mark or unmark a digital receipt as favorite in NL or DE.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: z.object({
        ticketId: z.string().min(1).describe("Receipt/ticket ID."),
        favorite: z.boolean().describe("true to favorite, false to unfavorite."),
        country: countryField,
      }),
    },
    withJsonTool((args) => c.setReceiptFavorite(args))
  );
}
