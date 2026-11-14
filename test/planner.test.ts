import test from "node:test";
import assert from "node:assert/strict";
import { TtlCache } from "../src/cache.js";
import { LidlClient } from "../src/client.js";
import {
  aggregateRegularProducts,
  isDepositItem,
  normalizeProductName,
  scoreProductMatch,
} from "../src/services/planner.js";
import { MemoryTokenStore, setTokenStore } from "../src/token-store.js";

test("normalizeProductName, isDepositItem, and scoreProductMatch handle truncated POS and German/Dutch names", () => {
  assert.strictEqual(normalizeProductName("Bio halfvolle melk 1L"), "bio halfvolle melk");
  assert.strictEqual(normalizeProductName("Käseaufschnitt 250g"), "kaseaufschnitt");
  assert.strictEqual(isDepositItem("Pfand 0,25 EM"), true);
  assert.strictEqual(isDepositItem("Druiven rood pitloos"), false);

  assert.ok(
    scoreProductMatch("Bio halfvolle melk", "Lidl Bio Halfvolle Melk 1 Liter") >= 0.7
  );
  assert.ok(
    scoreProductMatch("Min.wasser Kohlensä.", "Saskia Mineralwasser Kohlensäure 1,5L") >= 0.45
  );
  assert.ok(scoreProductMatch("croissant", "Buttercroissant") >= 0.45);
  assert.ok(scoreProductMatch("koffie", "Koffiecups") >= 0.45);
  assert.strictEqual(scoreProductMatch("Bio halfvolle melk", "Barilla Fusilli"), 0);
});

test("aggregateRegularProducts counts distinct receipts, excludes deposits, and flags dueForRestock", () => {
  const nowMs = Date.parse("2026-11-14T12:00:00Z");
  const receipts = [
    {
      id: "r1",
      date: "2026-11-01T12:00:00Z",
      total: 4.19,
      storeId: "DE0001",
      lines: [
        { description: "Bio Ingwer Shot", quantity: 1, price: 1.29, unitPrice: 1.29 },
        { description: "Pfand 0,25 EM", quantity: 1, price: 0.25, unitPrice: 0.25 },
        { description: "Scharreleieren 6 st", quantity: 1, price: 2.65, unitPrice: 2.65 },
      ],
    },
    {
      id: "r2",
      date: "2026-11-08T12:00:00Z",
      total: 3.19,
      storeId: "DE0001",
      lines: [
        { description: "Bio Ingwer Shot", quantity: 2, price: 2.58, unitPrice: 1.29 },
        { description: "Pfand 0,25 EM", quantity: 2, price: 0.5, unitPrice: 0.25 },
      ],
    },
  ];

  const { totalUniqueItems, regularProducts } = aggregateRegularProducts(receipts, {
    minPurchases: 2,
    nowMs,
  });

  // Deposits excluded, only Bio Ingwer Shot appears on 2 distinct receipts
  assert.strictEqual(totalUniqueItems, 2);
  assert.strictEqual(regularProducts.length, 1);
  assert.strictEqual(regularProducts[0].displayName, "Bio Ingwer Shot");
  assert.strictEqual(regularProducts[0].purchaseCount, 2);
  assert.strictEqual(regularProducts[0].totalQuantity, 3);
  assert.strictEqual(regularProducts[0].averageCadenceDays, 7);
  assert.strictEqual(regularProducts[0].daysSinceLastPurchase, 6);
  // 6 >= 7 * 0.8 (5.6) => due for restock
  assert.strictEqual(regularProducts[0].dueForRestock, true);
});

test("LidlClient.planGroceryTrip keeps country isolated, reuses Option A cache, and invalidates coupons on activation", async () => {
  setTokenStore(
    new MemoryTokenStore({
      access_token: "user-tok",
      refresh_token: "user-ref",
    })
  );
  const origFetch = globalThis.fetch;
  let couponActivated = false;
  const urlCounts = new Map<string, number>();

  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    const key = `${method} ${url}`;
    urlCounts.set(key, (urlCounts.get(key) ?? 0) + 1);

    if (url === "https://stores.test/api/v1/users/me/favorite/nl") {
      return new Response(JSON.stringify({ storeKey: "NL0001" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://tickets.test/api/v3/nl/tickets") {
      return new Response(
        JSON.stringify([
          { id: "t1", date: "2026-11-01T10:00:00Z", totalAmount: 2.39 },
          { id: "t2", date: "2026-11-08T10:00:00Z", totalAmount: 3.68 },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://tickets.test/api/v3/nl/tickets/t1") {
      return new Response(
        JSON.stringify({
          id: "t1",
          date: "2026-11-01T10:00:00Z",
          totalAmount: 2.39,
          store: { id: "NL0001", name: "Amsterdam" },
          itemsLine: [{ description: "Bio halfvolle melk", quantity: 1, extendedAmount: 1.29 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://tickets.test/api/v3/nl/tickets/t2") {
      return new Response(
        JSON.stringify({
          id: "t2",
          date: "2026-11-08T10:00:00Z",
          totalAmount: 3.68,
          store: { id: "NL0001", name: "Amsterdam" },
          itemsLine: [
            { description: "Bio halfvolle melk", quantity: 1, extendedAmount: 1.29 },
            { description: "Druiven rood pitloos", quantity: 1, extendedAmount: 2.39 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://leaflet.test/api/v1/nl/campaignGroups?storeId=NL0001") {
      return new Response(
        JSON.stringify({
          groups: [
            {
              title: "Aanbiedingen",
              campaigns: [{ id: "c1", title: "Weekdeals" }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://leaflet.test/api/v1/nl/campaigns/c1?storeId=NL0001") {
      return new Response(
        JSON.stringify({
          id: "c1",
          title: "Weekdeals",
          products: [
            {
              id: "p1",
              title: "Bio Halfvolle Melk 1L",
              price: { price: 0.99, oldPrice: 1.29 },
            },
            {
              id: "p2",
              title: "Verse Koffiebonen",
              price: { price: 7.99 },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://coupons.test/app/api/v4/promotionslist") {
      return new Response(
        JSON.stringify({
          sections: [
            {
              name: "Jouw coupons",
              promotions: [
                {
                  id: "cp1",
                  promotionId: "promo-uuid-1",
                  title: "Bio Halfvolle Melk",
                  discount: { title: "25% KORTING" },
                  isActivated: couponActivated,
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (
      method === "POST" &&
      url === "https://coupons.test/app/api/v2/promotions/promo-uuid-1/activation"
    ) {
      couponActivated = true;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Unexpected request: " + key, { status: 500 });
  }) as typeof fetch;

  try {
    const cache = new TtlCache({ maxEntries: 100 });
    const client = new LidlClient(
      {
        stores: "https://stores.test",
        tickets: "https://tickets.test",
        leaflet: "https://leaflet.test",
        coupons: "https://coupons.test",
      },
      cache
    );

    const plan1 = await client.planGroceryTrip({
      country: "nl",
      extraItems: ["koffiebonen"],
      nowMs: Date.parse("2026-11-14T12:00:00Z"),
    });

    assert.strictEqual(plan1.country, "nl");
    assert.strictEqual(plan1.storeId, "NL0001");
    assert.strictEqual(plan1.receiptsAnalyzed, 2);
    assert.strictEqual(plan1.discountedRegulars.length, 1);
    assert.strictEqual(plan1.discountedRegulars[0].regular.displayName, "Bio halfvolle melk");
    assert.strictEqual(plan1.discountedRegulars[0].matchingOffers[0].id, "p1");
    assert.strictEqual(plan1.discountedRegulars[0].matchingCoupons[0].promotionId, "promo-uuid-1");
    assert.strictEqual(plan1.requestedItemDeals[0].matchingOffers[0].id, "p2");
    assert.strictEqual(plan1.unactivatedMatchingCoupons.length, 1);

    // Back-to-back call reuses Option A cache with zero additional upstream HTTP calls
    await client.getRegularProducts({ country: "nl" });
    await client.planGroceryTrip({ country: "nl", extraItems: ["koffiebonen"] });
    assert.strictEqual(urlCounts.get("GET https://tickets.test/api/v3/nl/tickets"), 1);
    assert.strictEqual(urlCounts.get("GET https://tickets.test/api/v3/nl/tickets/t1"), 1);
    assert.strictEqual(urlCounts.get("GET https://coupons.test/app/api/v4/promotionslist"), 1);

    // Activating a coupon invalidates promotionslist cache so next plan sees updated state
    await client.activateCoupon({ promotionId: "promo-uuid-1", country: "nl" });
    const planAfter = await client.planGroceryTrip({
      country: "nl",
      nowMs: Date.parse("2026-11-14T12:00:00Z"),
    });
    assert.strictEqual(urlCounts.get("GET https://coupons.test/app/api/v4/promotionslist"), 2);
    assert.strictEqual(planAfter.unactivatedMatchingCoupons.length, 0);
  } finally {
    globalThis.fetch = origFetch;
    setTokenStore(null);
  }
});
