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
            disclaimers: Array.isArray(mp?.disclaimers) ? mp.disclaimers : undefined,
          }
        : undefined,
    imageUrl:
      raw?.imageUrl ||
      (Array.isArray(raw?.imageUrls) ? raw.imageUrls[0] : undefined),
    imageUrls: Array.isArray(raw?.imageUrls) ? raw.imageUrls : undefined,
    badges: Array.isArray(raw?.badges) ? raw.badges : undefined,
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

export function mapBrochure(raw: any, groupName?: string): LidlBrochure {
  return {
    id: String(raw?.id || ""),
    title: String(raw?.title || ""),
    name: raw?.name || undefined,
    startDate: raw?.startDate || undefined,
    endDate: raw?.endDate || undefined,
    offerStartDate: raw?.offerStartDate || undefined,
    offerEndDate: raw?.offerEndDate || undefined,
    thumbnailUrl: raw?.thumbnailUrl || undefined,
    viewUrl: raw?.viewUrl || undefined,
    downloadUrl: raw?.downloadUrl || undefined,
    groupName,
  };
}

export function mapCoupon(raw: any, section?: string): LidlCoupon {
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
    startDate: raw?.validity?.start || undefined,
    endDate: raw?.validity?.end || undefined,
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

export function mapReceipt(raw: any): Receipt {
  const rawLines = raw?.itemsLine || raw?.lines || raw?.items || [];
  const lines: ReceiptLine[] | undefined = Array.isArray(rawLines) && rawLines.length > 0
    ? rawLines.map((l: any) => {
        const discount = Array.isArray(l?.discounts)
          ? l.discounts.reduce(
              (acc: number, d: any) => acc + Math.abs(parseNumeric(d?.amount) ?? 0),
              0
            )
          : parseNumeric(l?.discount);

        return {
          description: String(l?.description || l?.name || l?.articleName || ""),
          quantity: parseNumeric(l?.quantity) ?? 1,
          price:
            parseNumeric(l?.extendedAmount) ??
            parseNumeric(l?.totalAmount) ??
            parseNumeric(l?.price) ??
            0,
          discount: discount && discount > 0 ? Number(discount.toFixed(2)) : undefined,
          unitPrice: parseNumeric(l?.currentUnitPrice) ?? parseNumeric(l?.unitPrice),
          taxGroup: l?.taxGroupName || l?.taxGroup || undefined,
        };
      })
    : undefined;

  return {
    id: String(raw?.id || raw?.ticketId || ""),
    date: String(raw?.date || raw?.purchaseDate || ""),
    total:
      parseNumeric(raw?.totalAmount?.value ?? raw?.totalAmount ?? raw?.total) ?? 0,
    totalDiscount:
      parseNumeric(raw?.totalDiscount?.value ?? raw?.totalDiscount ?? raw?.totalSavings),
    currency: raw?.currency?.symbol || raw?.currency || "EUR",
    storeId: raw?.store?.id || raw?.storeCode || raw?.storeId || undefined,
    storeName: raw?.store?.name || raw?.storeName || undefined,
    isFavorite: typeof raw?.isFavorite === "boolean" ? raw.isFavorite : undefined,
    lines,
  };
}
