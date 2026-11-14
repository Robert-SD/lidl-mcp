import { z } from "zod";

export const countryField = z
  .string()
  .min(2)
  .max(5)
  .optional()
  .describe("2-letter Lidl country code (e.g. 'nl' or 'de'). Defaults to LIDL_COUNTRY ('nl').");

export function toolError(error: any) {
  return {
    content: [{ type: "text" as const, text: `Error: ${error.message}` }],
    isError: true,
  };
}

export function withJsonTool<TArgs>(
  fn: (args: TArgs) => Promise<unknown>
): (args: TArgs) => Promise<any> {
  return async (args: TArgs) => {
    try {
      const result = await fn(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: any) {
      return toolError(error);
    }
  };
}
