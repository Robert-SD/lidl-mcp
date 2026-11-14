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

  globalThis.fetch = (async (input: any, init: any) => {
    seenUrls.push(String(input));
    const url = String(input);
    if (url.includes("/q/api/search")) {
      assert.strictEqual(
        init?.headers?.Accept,
        "application/mindshift.search+json;version=2"
      );
      return new Response(
        JSON.stringify({
          numFound: 1,
          items: [
            {
              gridbox: {
                data: {
                  erpNumber: "100397447",
                  productId: 100397447,
                  title: "Bohrmaschine",
                  price: { price: 29.99, currencySymbol: "€" },
                  stockAvailability: { onlineAvailable: true },
                  canonicalPath: "/p/bohrmaschine/p100397447",
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ title: "Product" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const client = new LidlClient({}, new TtlCache());
    await client.getShopProduct({ productErp: "100356883", country: "nl" });
    await client.getShopProduct({ productErp: "100356883", country: "de" });
    const searchRes = await client.searchShopProducts({
      query: "bohrmaschine",
      country: "de",
      limit: 5,
    });
    // Repeat identical search to verify cache hit
    await client.searchShopProducts({
      query: "bohrmaschine",
      country: "de",
      limit: 5,
    });

    assert.strictEqual(seenUrls[0], "https://www.lidl.nl/p/api/detail/100356883/NL/nl");
    assert.strictEqual(seenUrls[1], "https://www.lidl.de/p/api/detail/100356883/DE/de");
    assert.strictEqual(seenUrls.length, 3);
    assert.ok(seenUrls[2].startsWith("https://www.lidl.de/q/api/search?"));
    assert.ok(seenUrls[2].includes("assortment=DE"));
    assert.ok(seenUrls[2].includes("locale=de_DE"));
    assert.strictEqual(searchRes.total, 1);
    assert.strictEqual(searchRes.products[0].erpNumber, "100397447");
    assert.strictEqual(client.cacheStats().hits, 1);
  } finally {
    globalThis.fetch = origFetch;
    setTokenStore(null);
  }
});

test("LidlClient handles uppercase country loyalty profile/summary, favorite-store stampcard lookup, and 404 couponPlus", async () => {
  setTokenStore(
    new MemoryTokenStore({
      access_token: "fake-access-token",
      refresh_token: "fake-refresh",
      expires_at: Date.now() + 3600_000,
    })
  );
  const origFetch = globalThis.fetch;
  const seenUrls: string[] = [];

  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    seenUrls.push(url);

    if (url === "https://accounts.test/connect/userinfo") {
      return new Response(JSON.stringify({ name: "Test User", sub: "sub-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://profile.test/api/v1/NL/loyalty") {
      return new Response(JSON.stringify("00000000000000001"), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://loyaltytab.test/api/v2/DE/summary") {
      return new Response(JSON.stringify({ activated: [{ id: "a1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://stores.test/api/v1/users/me/favorite/de") {
      return new Response(JSON.stringify({ storeKey: "DE0123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://stampcard.test/api/v3/de/user/promotions?storeId=DE0123") {
      return new Response(JSON.stringify([{ id: "sc1" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://deposits.test/api/v1/de/deposits") {
      return new Response(JSON.stringify({ total: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://couponplus.test/api/v4/nl/user/promotions") {
      return new Response("Not Found", { status: 404 });
    }
    return new Response("Unexpected URL: " + url, { status: 500 });
  }) as typeof fetch;

  try {
    const client = new LidlClient(
      {
        accounts: "https://accounts.test",
        profile: "https://profile.test",
        loyaltytab: "https://loyaltytab.test",
        stores: "https://stores.test",
        stampcard: "https://stampcard.test",
        deposits: "https://deposits.test",
        couponplus: "https://couponplus.test",
      },
      new TtlCache()
    );

    const profile = await client.getProfile("nl");
    assert.strictEqual(profile.loyaltyCardNumber, "00000000000000001");
    assert.strictEqual(profile.name, "Test User");

    const summary = await client.getLoyaltyProgram("de");
    assert.deepStrictEqual(summary.loyaltySummary, { activated: [{ id: "a1" }] });
    assert.strictEqual(summary.storeId, "DE0123");
    assert.deepStrictEqual(summary.stampcards, [{ id: "sc1" }]);
    assert.deepStrictEqual(summary.deposits, { total: 0 });

    // Second read should hit in-process cache
    const profile2 = await client.getProfile("nl");
    assert.strictEqual(profile2.loyaltyCardNumber, "00000000000000001");
    assert.ok(client.cacheStats().hits >= 2);
    assert.strictEqual(client.cacheStats().scope, "process");

    const couponPlus = await client.getCouponPlus("nl");
    assert.strictEqual(couponPlus.active, false);
    assert.strictEqual(couponPlus.country, "nl");

    assert.ok(seenUrls.includes("https://accounts.test/connect/userinfo"));
    assert.ok(seenUrls.includes("https://profile.test/api/v1/NL/loyalty"));
    assert.ok(seenUrls.includes("https://loyaltytab.test/api/v2/DE/summary"));
    assert.ok(seenUrls.includes("https://stores.test/api/v1/users/me/favorite/de"));
    assert.ok(seenUrls.includes("https://stampcard.test/api/v3/de/user/promotions?storeId=DE0123"));
  } finally {
    globalThis.fetch = origFetch;
    setTokenStore(null);
  }
});
