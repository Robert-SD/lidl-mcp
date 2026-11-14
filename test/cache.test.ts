import test from "node:test";
import assert from "node:assert/strict";
import {
  TtlCache,
  cacheKey,
  getSharedCache,
  resetSharedCache,
  stableStringify,
} from "../src/cache.js";
import { cacheKeyFor, cachePolicyFor } from "../src/cache-policy.js";

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
  assert.strictEqual(cache.get("k1"), "v1"); // refresh k1 recency
  cache.set("k3", "v3", 500); // evicts k2

  assert.strictEqual(cache.get("k2"), undefined);
  assert.strictEqual(cache.get("k1"), "v1");
  assert.strictEqual(cache.get("k3"), "v3");

  now = 2000; // expire all
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

test("cacheKeyFor produces distinct keys per scope and normalized query params", () => {
  const k1 = cacheKeyFor(
    "https://api.example",
    "/v1/items",
    { method: "GET", query: { b: "2", a: "1", empty: "" } },
    "scope-a"
  );
  const k2 = cacheKeyFor(
    "https://api.example",
    "/v1/items",
    { method: "GET", query: { a: "1", b: "2" } },
    "scope-a"
  );
  const k3 = cacheKeyFor(
    "https://api.example",
    "/v1/items",
    { method: "GET", query: { a: "1", b: "2" } },
    "scope-b"
  );

  assert.strictEqual(k1, k2);
  assert.notStrictEqual(k1, k3);
  assert.strictEqual(cachePolicyFor("/v1/items", { method: "GET" }), null);
  assert.ok(cacheKey("GET /x", [1]).startsWith("GET /x "));
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
