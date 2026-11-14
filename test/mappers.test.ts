import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBrochure,
  mapCampaign,
  mapCoupon,
  mapOfferProduct,
  mapReceipt,
  mapStore,
} from "../src/mappers.js";
import { resolveCountry } from "../src/countries.js";

test("resolveCountry normalizes nl and de presets", () => {
  const nl = resolveCountry("NL");
  assert.strictEqual(nl.country, "nl");
  assert.strictEqual(nl.isoCountryCode, "NL");
  assert.strictEqual(nl.language, "nl");
  assert.strictEqual(nl.locale, "nl_NL");
  assert.strictEqual(nl.shopBaseUrl, "https://www.lidl.nl");

  const de = resolveCountry("de");
  assert.strictEqual(de.country, "de");
  assert.strictEqual(de.isoCountryCode, "DE");
  assert.strictEqual(de.language, "de");
  assert.strictEqual(de.locale, "de_DE");
  assert.strictEqual(de.shopBaseUrl, "https://www.lidl.de");
});

test("mapStore extracts amenities and coordinates", () => {
  const store = mapStore(
    {
      storeKey: "NL0135",
      name: "Amsterdam",
      address: "Hemonylaan 25A",
      postalCode: "1074 BJ",
      locality: "Amsterdam",
      location: { latitude: 52.35791, longitude: 4.90147 },
      amenities: [{ literalKey: "location_storedetail_shopngo" }],
      zone: "NL1",
    },
    "nl"
  );
  assert.strictEqual(store.storeKey, "NL0135");
  assert.deepStrictEqual(store.amenities, ["shopngo"]);
  assert.strictEqual(store.zone, "NL1");
  assert.strictEqual(store.latitude, 52.35791);
});

test("mapOfferProduct maps mainPrice and campaign metadata", () => {
  const product = mapOfferProduct(
    {
      id: "10008785_11563244",
      wawiId: "6612949",
      title: "Croky chips",
      additionalInfo: "300 g",
      mainPrice: {
        price: 1.99,
        oldPrice: 2.49,
        symbol: "€",
        discount: "XXL",
      },
      isStore: true,
    },
    { id: "10008785", title: "Aanbiedingen" }
  );
  assert.strictEqual(product.price?.now, 1.99);
  assert.strictEqual(product.price?.was, 2.49);
  assert.strictEqual(product.price?.discountLabel, "XXL");
  assert.strictEqual(product.campaignTitle, "Aanbiedingen");
});

test("mapCoupon, mapCampaign, mapBrochure, and mapReceipt normalize fields", () => {
  const coupon = mapCoupon(
    {
      id: "NLSD000533325",
      promotionId: "8ce6421c",
      title: "Fuet",
      discount: { title: "25% KORTING", description: "Van €3,99 voor €2,99" },
      validity: { start: "2026-11-12T23:00:01Z", end: "2026-11-16T22:59:59Z" },
      isActivated: true,
      specialPromotion: { tag: "op=op" },
    },
    "AllStores"
  );
  assert.strictEqual(coupon.isActivated, true);
  assert.strictEqual(coupon.specialTag, "op=op");
  assert.strictEqual(coupon.section, "AllStores");

  const campaign = mapCampaign({ id: "100", title: "Aanbiedingen", subtitle: "MA" }, "Deze week");
  assert.strictEqual(campaign.groupTitle, "Deze week");

  const brochure = mapBrochure({ id: "b1", title: "Folder", downloadUrl: "https://example/f.pdf" }, "Actueel");
  assert.strictEqual(brochure.downloadUrl, "https://example/f.pdf");

  const receipt = mapReceipt({
    id: "t1",
    date: "2026-11-14T12:00:00Z",
    totalAmount: "12,50",
    totalDiscount: "1.25",
    store: { id: "NL0135", name: "Amsterdam" },
    itemsLine: [
      { description: "Melk", quantity: "2", extendedAmount: "2,40", discounts: [{ amount: "0.20" }] },
    ],
  });
  assert.strictEqual(receipt.total, 12.5);
  assert.strictEqual(receipt.lines?.[0].price, 2.4);
  assert.strictEqual(receipt.lines?.[0].discount, 0.2);
});
