import test from "node:test";
import assert from "node:assert/strict";
import { LidlClient } from "../src/client.js";
import { TtlCache } from "../src/cache.js";
import { LidlAuthError, MemoryTokenStore, setTokenStore } from "../src/token-store.js";

test("LidlClient throws API_NOT_CONFIGURED when baseUrl is empty", async () => {
  setTokenStore(new MemoryTokenStore({ access_token: "tok-1" }));
  try {
    const client = new LidlClient("", new TtlCache());
    await assert.rejects(
      () => client.request("/v1/profile"),
      (err: unknown) => err instanceof LidlAuthError && err.code === "API_NOT_CONFIGURED"
    );
  } finally {
    setTokenStore(null);
  }
});

test("LidlClient sends bearer token, query params, and JSON body via fetch", async () => {
  setTokenStore(new MemoryTokenStore({ access_token: "tok-secret" }));
  const origFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true, items: [1, 2] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const client = new LidlClient("https://api.lidl.test", new TtlCache());
    const result = await client.request("/v1/search", {
      method: "POST",
      query: { q: "melk", tag: ["a", "b"], skip: undefined },
      body: { limit: 10 },
    });

    assert.deepStrictEqual(result, { ok: true, items: [1, 2] });
    assert.strictEqual(capturedUrl, "https://api.lidl.test/v1/search?q=melk&tag=a&tag=b");
    assert.strictEqual(capturedInit?.method, "POST");
    assert.strictEqual((capturedInit?.headers as any)?.Authorization, "Bearer tok-secret");
    assert.strictEqual(capturedInit?.body, '{"limit":10}');
  } finally {
    globalThis.fetch = origFetch;
    setTokenStore(null);
  }
});
