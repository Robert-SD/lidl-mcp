import { z } from "zod";
import { normalizeToolError } from "../errors.js";

export const countryField = z
  .string()
  .min(2)
  .max(5)
  .optional()
  .describe("2-letter Lidl country code (e.g. 'nl' or 'de'). Defaults to LIDL_COUNTRY ('nl').");

export function toolError(error: unknown) {
  const payload = normalizeToolError(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

export function withJsonTool<TArgs>(
  fn: (args: TArgs) => Promise<unknown>
): (args: TArgs) => Promise<any> {
  return async (args: TArgs) => {
    try {
      const result = await fn(args);
      const text = JSON.stringify(result, null, 2);
      const isPlainObj =
        result !== null && typeof result === "object" && !Array.isArray(result);
      return {
        content: [{ type: "text" as const, text }],
        ...(isPlainObj
          ? { structuredContent: JSON.parse(text) as Record<string, unknown> }
          : {}),
      };
    } catch (error: unknown) {
      return toolError(error);
    }
  };
}
