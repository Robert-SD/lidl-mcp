#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as dotenv from "dotenv";
import { runCliCommand } from "./cli.js";
import { LidlClient } from "./client.js";
import { registerAccountTools } from "./tools/account.js";
import { registerCouponTools } from "./tools/coupons.js";
import { toolError } from "./tools/helpers.js";
import { registerOfferTools } from "./tools/offers.js";
import { registerPlannerTools } from "./tools/planner.js";
import { registerReceiptTools } from "./tools/receipts.js";
import { registerStoreTools } from "./tools/stores.js";

// Load local .env if present
dotenv.config();

export { toolError };

function loadPackageVersion(): string {
  try {
    const raw = fs.readFileSync(
      new URL("../package.json", import.meta.url),
      "utf-8"
    );
    return JSON.parse(raw).version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

const SERVER_VERSION = loadPackageVersion();
const client = new LidlClient();

export function createServer(customClient?: LidlClient): McpServer {
  const c = customClient || client;
  const server = new McpServer({
    name: "lidl-mcp",
    version: SERVER_VERSION,
  });

  registerAccountTools(server, c);
  registerStoreTools(server, c);
  registerOfferTools(server, c);
  registerCouponTools(server, c);
  registerReceiptTools(server, c);
  registerPlannerTools(server, c);

  return server;
}

async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main(): Promise<void> {
  const handled = await runCliCommand(process.argv.slice(2), client);
  if (!handled) {
    await startServer();
  }
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    const scriptPath = fs.realpathSync(path.resolve(process.argv[1]));
    const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
    return scriptPath === modulePath;
  } catch {
    return false;
  }
}

if (isDirectExecution() && !process.env.NODE_TEST_CONTEXT) {
  main().catch((err) => {
    process.stderr.write(`Fatal error: ${err.message}\n`);
    process.exit(1);
  });
}
