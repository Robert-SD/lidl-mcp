import test from "node:test";
import assert from "node:assert/strict";
import {
  TtlCache,
  cacheKey,
  getSharedCache,
  resetSharedCache,
  stableStringify,
} from "../src/cache.js";
import { CACHE_TTL, cacheKeyFor, cachePolicyFor } from "../src/cache-policy.js";

test("stableStringify sorts keys deterministically", () => {
  assert.strictEqual(
    stableStringify({ b: 2, a: { d: 4, c: 3 }, u: undefined }),
    '{"a":{"c":3,"d":4},"b":2}'
  );
});

test("TtlCache respects TTL, LRU eviction, invalidate, and wrap coalescing", async () => {
  let now = 1000;
  const cache = new TtlCache({ maxEntries: 2, now: () => now });

  cache.set("k1", "v1", 500);
  cache.set("k2", "v2", 500);
  assert.strictEqual(cache.get("k1"), "v1");
  cache.set("k3", "v3", 500);

  assert.strictEqual(cache.get("k2"), undefined);
  assert.strictEqual(cache.get("k1"), "v1");
  assert.strictEqual(cache.get("k3"), "v3");

  now = 2000;
  assert.strictEqual(cache.get("k1"), undefined);

  let loaderCalls = 0;
  const [a, b] = await Promise.all([
    cache.wrap("prefix:1", 1000, async () => {
      loaderCalls++;
      return { ok: true };
    }),
    cache.wrap("prefix:1", 1000, async () => {
      loaderCalls++;
      return { ok: true };
    }),
  ]);
  assert.strictEqual(loaderCalls, 1);
  assert.deepStrictEqual(a, { ok: true });
  assert.deepStrictEqual(b, { ok: true });

  assert.strictEqual(cache.invalidate("prefix:"), 1);
  assert.strictEqual(cache.stats().evictions, 1);
});

test("cacheKeyFor isolates countries, languages, coupons Store-Id/Zone, and scopes", () => {
  const nlKey = cacheKeyFor(
    "https://coupons.lidlplus.com",
    "/app/api/v4/promotionslist/anonymous",
    { host: "coupons", country: "nl", language: "nl", method: "GET" },
    "anonymous"
  );
  const deKey = cacheKeyFor(
    "https://coupons.lidlplus.com",
    "/app/api/v4/promotionslist/anonymous",
    { host: "coupons", country: "de", language: "de", method: "GET" },
    "anonymous"
  );
  const storeAKey = cacheKeyFor(
    "https://coupons.lidlplus.com",
    "/app/api/v4/promotionslist",
    {
      host: "coupons",
      country: "nl",
      language: "nl",
      method: "GET",
      headers: { "Store-Id": "NL0100" },
    } as any,
    "user-1"
  );
  const storeBKey = cacheKeyFor(
    "https://coupons.lidlplus.com",
    "/app/api/v4/promotionslist",
    {
      host: "coupons",
      country: "nl",
      language: "nl",
      method: "GET",
      headers: { "Store-Id": "NL0200" },
    } as any,
    "user-1"
  );

  assert.notStrictEqual(nlKey, deKey);
  assert.notStrictEqual(storeAKey, storeBKey);
  assert.ok(cacheKey("GET /x", [1]).startsWith("GET /x "));
});

test("cachePolicyFor caches reference/leaflet/receipts and uses liveList TTL for user overviews while keeping writes uncached", () => {
  assert.strictEqual(
    cachePolicyFor("/api/v4/nl", { host: "stores", method: "GET" })?.ttl,
    CACHE_TTL.catalog
  );
  assert.strictEqual(
    cachePolicyFor("/api/v2/de/Brochures", { host: "brochures", method: "GET" })?.ttl,
    CACHE_TTL.offers
  );
  assert.strictEqual(CACHE_TTL.offers, 60 * 60 * 1000);
  assert.strictEqual(
    cachePolicyFor("/app/api/v4/promotionsdetails/promo-123", { host: "coupons", method: "GET" })?.ttl,
    CACHE_TTL.offers
  );
  assert.strictEqual(
    cachePolicyFor("/connect/userinfo", { host: "accounts", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/api/v1/NL/loyalty", { host: "profile", method: "GET" })?.ttl,
    CACHE_TTL.productDetail
  );
  assert.strictEqual(
    cachePolicyFor("/api/v2/NL/summary", { host: "loyaltytab", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/api/v3/nl/user/promotions", { host: "stampcard", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/api/v1/nl/deposits", { host: "deposits", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/api/v4/nl/user/promotions", { host: "couponplus", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/q/api/search", { host: "shop", method: "GET" })?.ttl,
    CACHE_TTL.search
  );
  assert.strictEqual(
    cachePolicyFor("/api/v3/nl/tickets/abc-123", { host: "tickets", method: "GET" })?.ttl,
    CACHE_TTL.receiptDetail
  );
  assert.strictEqual(
    cachePolicyFor("/api/v3/nl/tickets", { host: "tickets", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/app/api/v4/promotionslist", { host: "coupons", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/api/v1/users/me/favorite/nl", { host: "stores", method: "GET" })?.ttl,
    CACHE_TTL.liveList
  );
  assert.strictEqual(
    cachePolicyFor("/app/api/v2/promotions/123/activation", { host: "coupons", method: "POST" }),
    null
  );
});

test("getSharedCache & resetSharedCache honor LIDL_MCP_CACHE", () => {
  const prev = process.env.LIDL_MCP_CACHE;
  try {
    process.env.LIDL_MCP_CACHE = "off";
    const disabled = resetSharedCache();
    assert.strictEqual(disabled.isEnabled, false);

    delete process.env.LIDL_MCP_CACHE;
    const enabled = resetSharedCache();
    assert.strictEqual(enabled.isEnabled, true);
    assert.strictEqual(getSharedCache(), enabled);
  } finally {
    if (prev === undefined) delete process.env.LIDL_MCP_CACHE;
    else process.env.LIDL_MCP_CACHE = prev;
    resetSharedCache();
  }
});
