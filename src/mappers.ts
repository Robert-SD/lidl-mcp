import { resolveCountry } from "./countries.js";
import { normalizeTimestamp } from "./dates.js";
import {
  LidlBrochure,
  LidlCampaign,
  LidlCoupon,
  LidlOfferProduct,
  Receipt,
  ReceiptLine,
  StoreInfo,
} from "./types.js";

export function mapStore(raw: any, country?: string): StoreInfo {
  const amenities = Array.isArray(raw?.amenities)
    ? raw.amenities
        .map((a: any) =>
          typeof a === "string"
            ? a
            : (a?.literalKey || "").replace(/^location_storedetail_/, "")
        )
        .filter(Boolean)
    : undefined;

  return {
    storeKey: String(raw?.storeKey || raw?.id || ""),
    name: String(raw?.name || ""),
    address: raw?.address || undefined,
    postalCode: raw?.postalCode || undefined,
    locality: raw?.locality || undefined,
    state: raw?.state || undefined,
    province: raw?.province || undefined,
    country: country?.toLowerCase(),
    isLidlPlus: typeof raw?.isLidlPlus === "boolean" ? raw.isLidlPlus : undefined,
    latitude: raw?.location?.latitude ?? raw?.latitude,
    longitude: raw?.location?.longitude ?? raw?.longitude,
    distanceMeters: typeof raw?.distance === "number" ? Math.round(raw.distance) : undefined,
    zone: raw?.zone || undefined,
    showOfferRegion: raw?.showOfferRegion || undefined,
    amenities: amenities?.length ? amenities : undefined,
  };
}

export function mapCampaign(raw: any, groupTitle?: string): LidlCampaign {
  return {
    id: String(raw?.id || ""),
    title: String(raw?.title || ""),
    subtitle: raw?.subtitle || undefined,
    kind: raw?.kind || undefined,
    imageUrl: raw?.image4x3Url || raw?.wonImage?.url || undefined,
    groupTitle,
  };
}

export function mapOfferProduct(
  raw: any,
  campaign?: { id?: string; title?: string }
): LidlOfferProduct {
  const mp = raw?.mainPrice;
  const priceNow =
    typeof mp?.price === "number"
      ? mp.price
      : typeof raw?.price === "number"
        ? raw.price
        : undefined;

  return {
    id: String(raw?.id || ""),
    wawiId: raw?.wawiId ? String(raw.wawiId) : undefined,
    articleNumber: raw?.articleNumber ? String(raw.articleNumber) : undefined,
    title: String(raw?.title || ""),
    subtitle: raw?.subtitle || undefined,
    additionalInfo: raw?.additionalInfo || undefined,
    brand: raw?.brand || undefined,
    description: raw?.description || undefined,
    price:
      priceNow !== undefined
        ? {
            now: priceNow,
            was: typeof mp?.oldPrice === "number" ? mp.oldPrice : undefined,
            currency: mp?.symbol || "€",
            discountLabel: mp?.discount || undefined,
            disclaimers: Array.isArray(mp?.disclaimers)
              ? mp.disclaimers.filter((d: unknown): d is string => typeof d === "string" && d.length > 0)
              : undefined,
          }
        : undefined,
    imageUrl:
      raw?.imageUrl ||
      (Array.isArray(raw?.imageUrls) ? raw.imageUrls.find((u: unknown) => typeof u === "string") : undefined),
    imageUrls: Array.isArray(raw?.imageUrls)
      ? raw.imageUrls.filter((u: unknown): u is string => typeof u === "string" && u.length > 0)
      : undefined,
    badges: Array.isArray(raw?.badges)
      ? raw.badges.map((b: any) => ({
          ...(typeof b?.type === "string" && b.type ? { type: b.type } : {}),
          ...(typeof b?.title === "string" && b.title ? { title: b.title } : {}),
        }))
      : undefined,
    isOnline:
      typeof raw?.isOnline === "boolean"
        ? raw.isOnline
        : typeof raw?.online === "boolean"
          ? raw.online
          : undefined,
    isStore: typeof raw?.isStore === "boolean" ? raw.isStore : undefined,
    campaignId: campaign?.id,
    campaignTitle: campaign?.title,
  };
}

export function mapBrochure(
  raw: any,
  groupName?: string,
  country?: string
): LidlBrochure {
  const { zoneId } = resolveCountry(country);
  const startNorm = normalizeTimestamp(raw?.startDate, zoneId, { naiveAs: "local" });
  const endNorm = normalizeTimestamp(raw?.endDate, zoneId, { naiveAs: "local" });
  const offerStartNorm = normalizeTimestamp(raw?.offerStartDate, zoneId, { naiveAs: "local" });
  const offerEndNorm = normalizeTimestamp(raw?.offerEndDate, zoneId, { naiveAs: "local" });
  return {
    id: String(raw?.id || ""),
    title: String(raw?.title || ""),
    name: raw?.name || undefined,
    startDate: startNorm?.iso ?? (raw?.startDate || undefined),
    endDate: endNorm?.iso ?? (raw?.endDate || undefined),
    startLocalDate: startNorm?.localDate,
    endLocalDate: endNorm?.localDate,
    offerStartDate: offerStartNorm?.iso ?? (raw?.offerStartDate || undefined),
    offerEndDate: offerEndNorm?.iso ?? (raw?.offerEndDate || undefined),
    thumbnailUrl: raw?.thumbnailUrl || undefined,
    viewUrl: raw?.viewUrl || undefined,
    downloadUrl: raw?.downloadUrl || undefined,
    groupName,
  };
}

export function mapCoupon(
  raw: any,
  section?: string,
  country?: string
): LidlCoupon {
  const { zoneId } = resolveCountry(country);
  const startNorm = normalizeTimestamp(raw?.validity?.start, zoneId, { naiveAs: "utc" });
  const endNorm = normalizeTimestamp(raw?.validity?.end, zoneId, { naiveAs: "utc" });
  return {
    id: String(raw?.id || ""),
    promotionId: raw?.promotionId ? String(raw.promotionId) : undefined,
    title: String(raw?.title || ""),
    discountTitle: raw?.discount?.title || undefined,
    discountDescription: raw?.discount?.description || undefined,
    status: raw?.status || undefined,
    isActivated: Boolean(raw?.isActivated),
    isSpecial: typeof raw?.isSpecial === "boolean" ? raw.isSpecial : undefined,
    specialTag: raw?.specialPromotion?.tag || undefined,
    channel: raw?.channel || undefined,
    channels: Array.isArray(raw?.channels) ? raw.channels : undefined,
    startDate: startNorm?.iso ?? (raw?.validity?.start || undefined),
    endDate: endNorm?.iso ?? (raw?.validity?.end || undefined),
    startLocalDate: startNorm?.localDate,
    endLocalDate: endNorm?.localDate,
    imageUrl: raw?.image?.url || undefined,
    section,
    stores: Array.isArray(raw?.stores) && raw.stores.length > 0 ? raw.stores : undefined,
  };
}

function parseNumeric(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const n = Number(val.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&szlig;/g, "ß")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&amp;/g, "&")
    .replace(/&euro;/g, "€")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? decodeHtmlEntities(m[1]) : undefined;
}

/**
 * Parse Lidl HTML receipt (`htmlPrintedReceipt`) lines from `<span class="purchase_list">`.
 * Handles single articles, `unitPrice x qty` lines, weighted sublines, and `class="discount"` lines.
 */
export function parseHtmlReceiptLines(html: string): {
  lines: ReceiptLine[];
  totalDiscount?: number;
} {
  const start = html.indexOf('<span class="purchase_list">');
  if (start < 0) return { lines: [] };
  const stopMarkers = [
    '<span class="purchase_summary">',
    '<span class="total_payment">',
    '<span class="vat_info">',
  ];
  const stopIndices = stopMarkers
    .map((m) => html.indexOf(m, start))
    .filter((i) => i > start);
  const end = stopIndices.length > 0 ? Math.min(...stopIndices) : html.length;
  const block = html.slice(start, end);

  const rawLines = block.split(/\r?\n/);
  const lines: ReceiptLine[] = [];
  let sumDiscount = 0;

  for (const rawLine of rawLines) {
    const spanMatch = rawLine.match(/<span\b([^>]*)>/i);
    if (!spanMatch) continue;
    const attrs = spanMatch[1];
    const classAttr = extractAttr(attrs, "class") || "";
    const plain = decodeHtmlEntities(rawLine.replace(/<[^>]+>/g, "")).trim();
    if (!plain) continue;

    if (lines.length > 0 && /\bkg\s*x\s*\d+,\d{2}/i.test(plain)) {
      // Weighted sub-line (also carries class="article" on live HTML receipts)
      const weightMatch = plain.match(/(\d+,\d+)\s*kg\s*x\s*(\d+,\d{2})/i);
      if (weightMatch) {
        const prev = lines[lines.length - 1];
        prev.quantity = parseNumeric(weightMatch[1]) ?? prev.quantity;
        prev.unitPrice = parseNumeric(weightMatch[2]) ?? prev.unitPrice;
      }
    } else if (classAttr.includes("article")) {
      const description =
        extractAttr(attrs, "data-art-description") ||
        plain.replace(/\s+\d+,\d{2}\s*[A-Z]?\s*$/, "").trim();
      const unitPrice = parseNumeric(extractAttr(attrs, "data-unit-price"));
      const dataQty = parseNumeric(extractAttr(attrs, "data-art-quantity"));
      const taxGroup = extractAttr(attrs, "data-tax-type");

      // Match `1,69 x   2    3,38 A` or `2,39 B`
      const qtyMatch = plain.match(
        /(\d+,\d{2})\s*x\s*(\d+)\s+(-?\d+,\d{2})\s*([A-Z])?\s*$/i
      );
      if (qtyMatch) {
        lines.push({
          description,
          quantity: Number(qtyMatch[2]),
          unitPrice: parseNumeric(qtyMatch[1]) ?? unitPrice,
          price: parseNumeric(qtyMatch[3]) ?? unitPrice ?? 0,
          taxGroup,
        });
      } else {
        const priceMatch = plain.match(/(-?\d+,\d{2})\s*([A-Z])?\s*$/);
        const price = priceMatch ? parseNumeric(priceMatch[1]) : unitPrice;
        lines.push({
          description,
          quantity: dataQty ?? 1,
          unitPrice,
          price: price ?? 0,
          taxGroup,
        });
      }
    } else if (
      classAttr.includes("discount") ||
      /-\d+,\d{2}\s*$/.test(plain)
    ) {
      const amtMatch = plain.match(/(-\d+,\d{2})/);
      const amt = amtMatch ? Math.abs(parseNumeric(amtMatch[1]) ?? 0) : 0;
      if (amt > 0 && lines.length > 0) {
        const prev = lines[lines.length - 1];
        prev.discount = Number(((prev.discount ?? 0) + amt).toFixed(2));
        sumDiscount += amt;
      }
    }
  }

  return {
    lines,
    totalDiscount: sumDiscount > 0 ? Number(sumDiscount.toFixed(2)) : undefined,
  };
}

export function mapReceipt(raw: any, country?: string): Receipt {
  const { zoneId } = resolveCountry(country);
  const rawLines = raw?.itemsLine || raw?.lines || raw?.items || [];
  let lines: ReceiptLine[] | undefined =
    Array.isArray(rawLines) && rawLines.length > 0
      ? rawLines.map((l: any) => {
          const discount = Array.isArray(l?.discounts)
            ? l.discounts.reduce(
                (acc: number, d: any) =>
                  acc + Math.abs(parseNumeric(d?.amount) ?? 0),
                0
              )
            : parseNumeric(l?.discount);

          return {
            description: String(
              l?.description || l?.name || l?.articleName || ""
            ),
            quantity: parseNumeric(l?.quantity) ?? 1,
            price:
              parseNumeric(l?.extendedAmount) ??
              parseNumeric(l?.totalAmount) ??
              parseNumeric(l?.price) ??
              0,
            discount:
              discount && discount > 0 ? Number(discount.toFixed(2)) : undefined,
            unitPrice:
              parseNumeric(l?.currentUnitPrice) ?? parseNumeric(l?.unitPrice),
            taxGroup: l?.taxGroupName || l?.taxGroup || undefined,
          };
        })
      : undefined;

  let htmlTotalDiscount: number | undefined;
  if ((!lines || lines.length === 0) && typeof raw?.htmlPrintedReceipt === "string") {
    const parsed = parseHtmlReceiptLines(raw.htmlPrintedReceipt);
    if (parsed.lines.length > 0) {
      lines = parsed.lines;
      htmlTotalDiscount = parsed.totalDiscount;
    }
  }

  const storeObj = raw?.store;
  const storeName =
    storeObj?.name ||
    (storeObj?.locality && storeObj?.address
      ? `Lidl ${storeObj.locality} (${storeObj.address})`
      : storeObj?.locality) ||
    raw?.storeName ||
    undefined;

  const rawDate = raw?.date || raw?.purchaseDate || "";
  const dateNorm = normalizeTimestamp(
    typeof rawDate === "string" ? rawDate : String(rawDate),
    zoneId,
    { naiveAs: "utc" }
  );

  return {
    id: String(raw?.id || raw?.ticketId || ""),
    date: dateNorm?.iso ?? String(rawDate),
    localDate: dateNorm?.localDate,
    total:
      parseNumeric(raw?.totalAmount?.value ?? raw?.totalAmount ?? raw?.total) ?? 0,
    totalDiscount:
      parseNumeric(
        raw?.totalDiscount?.value ??
          raw?.totalDiscount ??
          raw?.totalSavings ??
          raw?.savings
      ) ?? htmlTotalDiscount,
    currency: raw?.currency?.symbol || raw?.currency || "EUR",
    storeId: storeObj?.id || raw?.storeCode || raw?.storeId || undefined,
    storeName,
    isFavorite: typeof raw?.isFavorite === "boolean" ? raw.isFavorite : undefined,
    lines,
  };
}
