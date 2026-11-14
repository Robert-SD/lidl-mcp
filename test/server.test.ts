import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/index.js";
import { LidlClient } from "../src/client.js";
import { TtlCache } from "../src/cache.js";
import { MemoryTokenStore, setTokenStore } from "../src/token-store.js";

const EXPECTED_TOOLS = [
  "lidl_login",
  "lidl_get_profile",
  "lidl_get_loyalty_summary",
  "lidl_cache_stats",
  "lidl_search_stores",
  "lidl_get_store_details",
  "lidl_get_favorite_store",
  "lidl_set_favorite_store",
  "lidl_get_brochures",
  "lidl_get_campaign_groups",
  "lidl_get_campaign_offers",
  "lidl_search_offers",
  "lidl_get_leaflet_product",
  "lidl_get_shop_product",
  "lidl_get_coupons",
  "lidl_get_coupon_details",
  "lidl_activate_coupon",
  "lidl_deactivate_coupon",
  "lidl_get_coupon_plus",
  "lidl_list_receipts",
  "lidl_get_receipt_details",
  "lidl_get_receipt_summary",
  "lidl_set_receipt_favorite",
  "lidl_get_regular_products",
  "lidl_plan_grocery_trip",
];

test("createServer: registers all 25 Lidl tools", () => {
  const server = createServer();
  const registered = Object.keys((server as any)._registeredTools);

  assert.strictEqual(registered.length, EXPECTED_TOOLS.length);
  for (const tool of EXPECTED_TOOLS) {
    assert.ok(registered.includes(tool), `Expected tool ${tool} to be registered`);
  }
});

test("createServer: write tools have readOnlyHint false, destructiveHint false", () => {
  const server = createServer();
  const writeTools = [
    "lidl_set_favorite_store",
    "lidl_activate_coupon",
    "lidl_deactivate_coupon",
    "lidl_set_receipt_favorite",
  ];
  for (const name of writeTools) {
    const tool = (server as any)._registeredTools[name];
    assert.ok(tool, `${name} should be registered`);
    assert.deepStrictEqual(tool.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
    });
  }
});

test("createServer: read tools have readOnlyHint true", () => {
  const server = createServer();
  const writeSet = new Set([
    "lidl_set_favorite_store",
    "lidl_activate_coupon",
    "lidl_deactivate_coupon",
    "lidl_set_receipt_favorite",
  ]);
  for (const name of EXPECTED_TOOLS) {
    if (writeSet.has(name)) continue;
    const tool = (server as any)._registeredTools[name];
    assert.deepStrictEqual(
      tool.annotations,
      { readOnlyHint: true },
      `${name} should have readOnlyHint: true`
    );
  }
});

test("lidl_login & lidl_cache_stats handlers return expected JSON", async () => {
  setTokenStore(new MemoryTokenStore(null));
  try {
    const cache = new TtlCache({ maxEntries: 42 });
    const client = new LidlClient({}, cache);
    const server = createServer(client);

    const loginTool = (server as any)._registeredTools["lidl_login"];
    const loginResp = await loginTool.handler({});
    const loginPayload = JSON.parse(loginResp.content[0].text);
    assert.strictEqual(loginPayload.status, "unauthenticated");
    assert.strictEqual(loginPayload.authenticated, false);
    assert.strictEqual(loginPayload.configured, true);

    const statsTool = (server as any)._registeredTools["lidl_cache_stats"];
    const statsResp = await statsTool.handler({});
    const statsPayload = JSON.parse(statsResp.content[0].text);
    assert.strictEqual(statsPayload.enabled, true);
    assert.strictEqual(statsPayload.maxEntries, 42);
  } finally {
    setTokenStore(null);
  }
});
