import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBrochure,
  mapCampaign,
  mapCoupon,
  mapOfferProduct,
  mapReceipt,
  mapStore,
  parseHtmlReceiptLines,
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
      badges: [{ type: "AvailableInStore", title: null }],
      isStore: true,
    },
    { id: "10008785", title: "Aanbiedingen" }
  );
  assert.strictEqual(product.price?.now, 1.99);
  assert.strictEqual(product.price?.was, 2.49);
  assert.strictEqual(product.price?.discountLabel, "XXL");
  assert.strictEqual(product.campaignTitle, "Aanbiedingen");
  assert.deepStrictEqual(product.badges, [{ type: "AvailableInStore" }]);
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
    "AllStores",
    "nl"
  );
  assert.strictEqual(coupon.isActivated, true);
  assert.strictEqual(coupon.specialTag, "op=op");
  assert.strictEqual(coupon.section, "AllStores");
  assert.strictEqual(coupon.startDate, "2026-11-13T00:00:01+01:00");
  assert.strictEqual(coupon.startLocalDate, "2026-11-13");
  assert.strictEqual(coupon.endDate, "2026-11-16T23:59:59+01:00");
  assert.strictEqual(coupon.endLocalDate, "2026-11-16");

  const campaign = mapCampaign({ id: "100", title: "Aanbiedingen", subtitle: "MA" }, "Deze week");
  assert.strictEqual(campaign.groupTitle, "Deze week");

  const brochure = mapBrochure(
    {
      id: "b1",
      title: "Folder",
      startDate: "2026-10-09T00:00:00",
      endDate: "2026-12-05T00:00:00",
      downloadUrl: "https://example/f.pdf",
    },
    "Actueel",
    "nl"
  );
  assert.strictEqual(brochure.downloadUrl, "https://example/f.pdf");
  assert.strictEqual(brochure.startDate, "2026-10-09T00:00:00+02:00");
  assert.strictEqual(brochure.startLocalDate, "2026-10-09");
  assert.strictEqual(brochure.endDate, "2026-12-05T00:00:00+01:00");
  assert.strictEqual(brochure.endLocalDate, "2026-12-05");

  const receiptList = mapReceipt(
    {
      id: "t1",
      date: "2026-04-10T19:14:49+00:00",
      totalAmount: "12,50",
      totalDiscount: "1.25",
      store: { id: "NL0135", name: "Amsterdam" },
      itemsLine: [
        { description: "Melk", quantity: "2", extendedAmount: "2,40", discounts: [{ amount: "0.20" }] },
      ],
    },
    "nl"
  );
  const receiptDetail = mapReceipt(
    {
      id: "t1",
      date: "2026-04-10T19:14:49",
      totalAmount: "12,50",
    },
    "nl"
  );
  assert.strictEqual(receiptList.date, "2026-04-10T21:14:49+02:00");
  assert.strictEqual(receiptList.localDate, "2026-04-10");
  assert.strictEqual(receiptDetail.date, receiptList.date);
  assert.strictEqual(receiptDetail.localDate, "2026-04-10");
  assert.strictEqual(receiptList.total, 12.5);
  assert.strictEqual(receiptList.lines?.[0].price, 2.4);
  assert.strictEqual(receiptList.lines?.[0].discount, 0.2);
});

test("parseHtmlReceiptLines and mapReceipt handle HTML receipts, discounts, weights, entities, and empty store name", () => {
  const html = `
<span class="purchase_list"><span id="purchase_list_line_1" class="currency">EUR</span>
<span id="purchase_list_line_2" class="article css_bold" data-art-quantity="0,44" data-art-description="Kaasjong &szlig;" data-unit-price="14,90" data-tax-type="A">Kaasjong &szlig;              6,56 A</span>
<span id="purchase_list_line_3" class="article" data-art-quantity="0,44" data-art-description="Kaasjong &szlig;" data-unit-price="14,90" data-tax-type="A">  0,440 kg x 14,90  EUR/kg</span>
<span id="purchase_list_line_4" class="article" data-art-description="Bio K&auml;se" data-unit-price="1,69" data-tax-type="B">Bio K&auml;se       1,69 x   2    3,38 B</span>
<span id="purchase_list_line_5" class="discount">  Lidl Plus korting            -0,50</span>
<span id="purchase_list_line_6">Preisvorteil                  -0,25</span>
</span><span class="purchase_summary"><span id="purchase_summary_5">Gesamter Preisvorteil 0,75</span></span>
`;

  const parsed = parseHtmlReceiptLines(html);
  assert.strictEqual(parsed.lines.length, 2);
  assert.deepStrictEqual(parsed.lines[0], {
    description: "Kaasjong ß",
    quantity: 0.44,
    unitPrice: 14.9,
    price: 6.56,
    taxGroup: "A",
  });
  assert.deepStrictEqual(parsed.lines[1], {
    description: "Bio Käse",
    quantity: 2,
    unitPrice: 1.69,
    price: 3.38,
    taxGroup: "B",
    discount: 0.75,
  });
  assert.strictEqual(parsed.totalDiscount, 0.75);

  const receipt = mapReceipt({
    id: "t-html",
    date: "2026-11-14T12:00:00Z",
    totalAmount: "9,19",
    store: { id: "DE1234", name: "", locality: "Berlin", address: "Hauptstr. 1" },
    ticketType: "HTML",
    htmlPrintedReceipt: html,
  });
  assert.strictEqual(receipt.storeName, "Lidl Berlin (Hauptstr. 1)");
  assert.strictEqual(receipt.total, 9.19);
  assert.strictEqual(receipt.totalDiscount, 0.75);
  assert.strictEqual(receipt.lines?.length, 2);
});
