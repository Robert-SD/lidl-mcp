import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/index.js";
import { LidlClient, LidlApiError } from "../src/client.js";
import { TtlCache } from "../src/cache.js";
import { LidlAuthError, MemoryTokenStore, setTokenStore } from "../src/token-store.js";
import { normalizeToolError } from "../src/errors.js";

const EXPECTED_TOOLS = [
  "lidl_login",
  "lidl_get_profile",
  "lidl_get_loyalty_program",
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
  "lidl_search_shop_products",
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

const STATEFUL_TOOLS = [
  "lidl_login",
  "lidl_set_favorite_store",
  "lidl_activate_coupon",
  "lidl_deactivate_coupon",
  "lidl_set_receipt_favorite",
];

test("createServer: registers all 26 Lidl tools with outputSchema", () => {
  const server = createServer();
  const registeredTools = (server as any)._registeredTools;
  const registered = Object.keys(registeredTools);

  assert.strictEqual(registered.length, EXPECTED_TOOLS.length);
  for (const name of EXPECTED_TOOLS) {
    assert.ok(registered.includes(name), `Expected tool ${name} to be registered`);
    assert.ok(registeredTools[name].outputSchema, `Expected ${name} to define outputSchema`);
  }
});

test("createServer: stateful & write tools have readOnlyHint false, destructiveHint false, idempotentHint true", () => {
  const server = createServer();
  for (const name of STATEFUL_TOOLS) {
    const tool = (server as any)._registeredTools[name];
    assert.ok(tool, `${name} should be registered`);
    assert.deepStrictEqual(tool.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  }
});

test("createServer: read tools have readOnlyHint true", () => {
  const server = createServer();
  const statefulSet = new Set(STATEFUL_TOOLS);
  for (const name of EXPECTED_TOOLS) {
    if (statefulSet.has(name)) continue;
    const tool = (server as any)._registeredTools[name];
    assert.deepStrictEqual(
      tool.annotations,
      { readOnlyHint: true },
      `${name} should have readOnlyHint: true`
    );
  }
});

test("createServer: lidl_set_favorite_store uses consistent storeId parameter", () => {
  const server = createServer();
  const tool = (server as any)._registeredTools["lidl_set_favorite_store"];
  const shape = tool.inputSchema.shape ?? {};
  assert.ok("storeId" in shape, "lidl_set_favorite_store should take storeId");
  assert.ok(!("storeKey" in shape), "lidl_set_favorite_store should not take storeKey");
});

test("lidl_login, lidl_cache_stats, structuredContent, and structured error taxonomy", async () => {
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
    assert.deepStrictEqual(loginResp.structuredContent, loginPayload);

    const statsTool = (server as any)._registeredTools["lidl_cache_stats"];
    const statsResp = await statsTool.handler({});
    const statsPayload = JSON.parse(statsResp.content[0].text);
    assert.strictEqual(statsPayload.enabled, true);
    assert.strictEqual(statsPayload.scope, "process");
    assert.strictEqual(statsPayload.maxEntries, 42);
    assert.ok(typeof statsPayload.note === "string" && statsPayload.note.length > 0);
    assert.deepStrictEqual(statsResp.structuredContent, statsPayload);

    // Structured error taxonomy on 404 from lidl_get_receipt_details
    setTokenStore(
      new MemoryTokenStore({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        saved_at: new Date().toISOString(),
      })
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ title: "Not Found", detail: "Ticket bogus not found", status: 404 }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      const receiptTool = (server as any)._registeredTools["lidl_get_receipt_details"];
      const errResp = await receiptTool.handler({ ticketId: "bogus" });
      assert.strictEqual(errResp.isError, true);
      const parsedErr = JSON.parse(errResp.content[0].text);
      assert.strictEqual(parsedErr.code, "not_found");
      assert.strictEqual(parsedErr.status, 404);
      assert.strictEqual(parsedErr.message, "Ticket bogus not found");
      assert.ok(!parsedErr.message.includes("https://"), "Error message should not expose raw URL");
    } finally {
      globalThis.fetch = origFetch;
    }

    assert.strictEqual(normalizeToolError(new LidlApiError(401, "Unauthorized")).code, "auth_expired");
    assert.strictEqual(normalizeToolError(new LidlApiError(429, "Slow down")).code, "rate_limited");
    assert.deepStrictEqual(
      normalizeToolError(new LidlApiError(400, JSON.stringify([{ title: "Validation", detail: "Invalid Store Id" }]))),
      { code: "bad_request", status: 400, message: "Invalid Store Id" }
    );
    assert.strictEqual(normalizeToolError(new LidlAuthError("not_logged_in", "Login required")).code, "unauthenticated");
    assert.strictEqual(normalizeToolError(new TypeError("fetch failed")).code, "network_error");

    const summaryTool = (server as any)._registeredTools["lidl_get_receipt_summary"];
    const summaryParse = summaryTool.outputSchema.safeParse({
      ticketId: "t1",
      date: "2026-04-10T21:14:49+02:00",
      localDate: "2026-04-10",
      purchaseAmountWithoutCurrency: "12,50",
      purchaseSavingsWithoutCurrency: "1,25",
      purchaseAmount: 12.5,
      purchaseSavings: 1.25,
      vendor: null,
      isHtml: true,
      hasHtmlDocument: true,
    });
    assert.strictEqual(summaryParse.success, true);

    const campOffersTool = (server as any)._registeredTools["lidl_get_campaign_offers"];
    const campParse = campOffersTool.outputSchema.safeParse({
      id: "100",
      title: "Weekactie",
      subtitle: null,
      products: [{ id: "100_1", title: "Appels", badges: [{ type: "AvailableInStore", title: null }] }],
    });
    assert.strictEqual(campParse.success, true);
  } finally {
    setTokenStore(null);
  }
});
