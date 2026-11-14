import test from "node:test";
import assert from "node:assert/strict";
import { LidlClient } from "../src/client.js";
import { TtlCache } from "../src/cache.js";
import { LidlAuthError, MemoryTokenStore, setTokenStore } from "../src/token-store.js";

test("LidlClient throws UNAUTHENTICATED when authMode is required and no token exists", async () => {
  setTokenStore(new MemoryTokenStore(null));
  try {
    const client = new LidlClient({ tickets: "https://tickets.test" }, new TtlCache());
    await assert.rejects(
      () => client.listReceipts({ country: "nl" }),
      (err: unknown) => err instanceof LidlAuthError && err.code === "UNAUTHENTICATED"
    );
  } finally {
    setTokenStore(null);
  }
});

test("LidlClient sends mobile headers, country-specific Accept-Language, and caches public store lookups", async () => {
  setTokenStore(new MemoryTokenStore(null));
  const origFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];

  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers as Record<string, string>) || {},
    });
    return new Response(
      JSON.stringify([
        { storeKey: "DE0347", name: "Niehl", locality: "Köln", postalCode: "50735" },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const client = new LidlClient({ stores: "https://stores.test" }, new TtlCache());
    const first = await client.searchStores({ country: "de", query: "Köln" });
    const second = await client.searchStores({ country: "de", query: "Köln" });

    assert.strictEqual(first.length, 1);
    assert.strictEqual(first[0].storeKey, "DE0347");
    assert.strictEqual(second.length, 1);
    // Second call should hit cache
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://stores.test/api/v4/de");
    assert.strictEqual(calls[0].headers["Accept-Language"], "de");
    assert.strictEqual(calls[0].headers["Tenant"], "lidl");
    assert.strictEqual(calls[0].headers["Operating-System"], "Android");
    assert.strictEqual(calls[0].headers["Authorization"], undefined);
  } finally {
    globalThis.fetch = origFetch;
    setTokenStore(null);
  }
});

test("LidlClient falls back to anonymous promotions when unauthenticated and uses authenticated endpoint when logged in", async () => {
  const origFetch = globalThis.fetch;
  const seenUrls: string[] = [];

  globalThis.fetch = (async (input: any) => {
    seenUrls.push(String(input));
    return new Response(
      JSON.stringify({
        sections: [
          {
            name: "AllStores",
            promotions: [
              {
                id: "NL1",
                promotionId: "uuid-1",
                title: "Fuet",
                discount: { title: "25% KORTING" },
                isActivated: false,
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    setTokenStore(new MemoryTokenStore(null));
    const client = new LidlClient({ coupons: "https://coupons.test" }, new TtlCache());
    const anonRes = await client.getCoupons({ country: "nl" });
    assert.strictEqual(anonRes.isAnonymousFallback, true);
    assert.strictEqual(anonRes.coupons[0].title, "Fuet");
    assert.ok(seenUrls[0].endsWith("/app/api/v4/promotionslist/anonymous"));

    setTokenStore(new MemoryTokenStore({ access_token: "tok-user" }));
    const authRes = await client.getCoupons({ country: "de" });
    assert.strictEqual(authRes.isAnonymousFallback, false);
    assert.ok(seenUrls[1].endsWith("/app/api/v4/promotionslist"));
  } finally {
    globalThis.fetch = origFetch;
    setTokenStore(null);
  }
});

test("LidlClient routes shop requests to country-specific lidl.nl / lidl.de", async () => {
  setTokenStore(new MemoryTokenStore(null));
  const origFetch = globalThis.fetch;
  const seenUrls: string[] = [];

  globalThis.fetch = (async (input: any) => {
    seenUrls.push(String(input));
    return new Response(JSON.stringify({ title: "Product" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const client = new LidlClient({}, new TtlCache());
    await client.getShopProduct({ productErp: "100356883", country: "nl" });
    await client.getShopProduct({ productErp: "100356883", country: "de" });

    assert.strictEqual(seenUrls[0], "https://www.lidl.nl/p/api/detail/100356883/NL/nl");
    assert.strictEqual(seenUrls[1], "https://www.lidl.de/p/api/detail/100356883/DE/de");
  } finally {
    globalThis.fetch = origFetch;
    setTokenStore(null);
  }
});
