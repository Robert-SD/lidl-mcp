import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LidlClient } from "../client.js";
import { withJsonTool } from "./helpers.js";

export function registerAccountTools(server: McpServer, c: LidlClient): void {
  server.registerTool(
    "lidl_login",
    {
      title: "Check Lidl Login Status",
      description:
        "Check authentication status, token persistence path, and configuration state for Lidl Plus.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({}),
    },
    withJsonTool(async () => {
      const status = await c.getAuthStatus();
      return {
        status: status.authenticated ? "authenticated" : "unauthenticated",
        ...status,
      };
    })
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
