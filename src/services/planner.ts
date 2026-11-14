import { mapWithConcurrency } from "../concurrency.js";
import { resolveCountry } from "../countries.js";
import {
  GroceryTripPlan,
  LidlCoupon,
  LidlOfferProduct,
  MatchedCouponSummary,
  MatchedOfferSummary,
  Receipt,
  RegularProductSummary,
  RegularProductsResult,
} from "../types.js";
import { getCoupons } from "./coupons.js";
import { fetchActiveOffersPool } from "./offers.js";
import { getFavoriteStore } from "./stores.js";
import { getReceiptDetails, listReceipts } from "./tickets.js";
import { LidlTransport } from "./transport.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const STOPWORDS = new Set([
  "de",
  "het",
  "een",
  "en",
  "van",
  "met",
  "voor",
  "in",
  "op",
  "per",
  "der",
  "die",
  "das",
  "und",
  "mit",
  "fur",
  "fuer",
  "aus",
  "vom",
  "im",
  "am",
  "st",
  "stk",
  "stuks",
  "pack",
  "packung",
  "kg",
  "gr",
  "g",
  "ml",
  "cl",
  "l",
  "liter",
  "lidl",
  "plus",
  "actie",
  "korting",
  "rabatt",
  "sparen",
  "gratis",
]);

const TOKEN_EXPANSIONS: Record<string, string> = {
  biol: "bio",
  fri: "frisch",
  min: "mineral",
  kohlensa: "kohlensaure",
  ungaris: "ungarisch",
  nati: "nativ",
  fruchtg: "fruchtgummi",
  halbvoll: "halfvolle",
};

const DEPOSIT_PATTERN = /\b(pfand|statiegeld|emballage|leergut)\b/i;

/** Fold diacritics and normalize product text for stable aggregation and matching. */
export function normalizeProductName(input: string): string {
  const folded = input
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return folded
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|g|ml|cl|l|stuks|st|stk|x)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Detect bottle/crate deposit lines (Pfand / Statiegeld) so they do not pollute grocery staples. */
export function isDepositItem(description: string): boolean {
  return DEPOSIT_PATTERN.test(description);
}

/** Tokenize normalized text into meaningful search stems (expanding common Lidl POS abbreviations). */
export function tokenizeForMatch(input: string): string[] {
  const normalized = normalizeProductName(input);
  if (!normalized) return [];

  const tokens: string[] = [];
  for (const raw of normalized.split(" ")) {
    const token = TOKEN_EXPANSIONS[raw] ?? raw;
    if (token.length < 2 || STOPWORDS.has(token) || /^\d+$/.test(token)) {
      continue;
    }
    if (!tokens.includes(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

function tokensCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  // Lidl POS descriptions truncate longer words (e.g. "kohlensa" vs "kohlensaure").
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  // German and Dutch compound nouns combine roots without spaces (e.g. "croissant" in "buttercroissant", "kase" vs "bergkase").
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) {
    return true;
  }
  return false;
}

/**
 * Score how well a regular product or requested item (`queryText`) matches an
 * active leaflet offer or coupon (`candidateText`), returning a score in `[0, 1]`.
 */
export function scoreProductMatch(
  queryText: string,
  candidateText: string
): number {
  const qNorm = normalizeProductName(queryText);
  const cNorm = normalizeProductName(candidateText);
  if (!qNorm || !cNorm) return 0;

  if (qNorm === cNorm) return 1;

  const qTokens = tokenizeForMatch(qNorm);
  const cTokens = tokenizeForMatch(cNorm);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  let matchedQuery = 0;
  for (const qt of qTokens) {
    if (cTokens.some((ct) => tokensCompatible(qt, ct))) {
      matchedQuery += 1;
    }
  }
  if (matchedQuery === 0) return 0;

  let matchedCandidate = 0;
  for (const ct of cTokens) {
    if (qTokens.some((qt) => tokensCompatible(qt, ct))) {
      matchedCandidate += 1;
    }
  }

  const queryRecall = matchedQuery / qTokens.length;
  const candidatePrecision = matchedCandidate / cTokens.length;
  const phraseBonus =
    qNorm.length >= 4 && (cNorm.includes(qNorm) || qNorm.includes(cNorm)) ? 0.15 : 0;

  // Require at least half of short queries (or >=2 tokens on multi-word names) unless exact phrase containment exists
  if (qTokens.length >= 2 && matchedQuery === 1 && phraseBonus === 0) {
    return Number((0.3 * queryRecall).toFixed(3));
  }

  const combined = 0.7 * queryRecall + 0.3 * candidatePrecision + phraseBonus;
  return Number(Math.min(1, combined).toFixed(3));
}

export interface GetRegularProductsOptions {
  country?: string;
  minPurchases?: number;
  maxReceipts?: number;
  daysBack?: number;
  yearOffset?: number;
  excludeDeposits?: boolean;
  limit?: number;
  nowMs?: number;
}

export async function fetchCountryReceiptsWithDetails(
  transport: LidlTransport,
  options: {
    country: string;
    maxReceipts?: number;
    daysBack?: number;
    yearOffset?: number;
    nowMs?: number;
  }
): Promise<{
  receiptsAvailable: number;
  detailedReceipts: Receipt[];
}> {
  const nowMs = options.nowMs ?? Date.now();
  const maxReceipts = Math.max(1, Math.min(options.maxReceipts ?? 25, 60));

  const overview = await listReceipts(transport, {
    country: options.country,
    yearOffset: options.yearOffset,
  });

  const sorted = [...overview].sort((a, b) => {
    const ta = Date.parse(a.date || "") || 0;
    const tb = Date.parse(b.date || "") || 0;
    return tb - ta;
  });

  const cutoffMs =
    typeof options.daysBack === "number" && options.daysBack > 0
      ? nowMs - options.daysBack * DAY_MS
      : undefined;

  const filtered = cutoffMs
    ? sorted.filter((r) => {
        const ts = Date.parse(r.date || "");
        return !Number.isNaN(ts) && ts >= cutoffMs;
      })
    : sorted;

  const selected = filtered.slice(0, maxReceipts);
  // Relies on TtlCache 30-day receipt-detail cache + concurrency limit 4.
  const detailedReceipts = await mapWithConcurrency(selected, 4, (r) =>
    getReceiptDetails(transport, { ticketId: r.id, country: options.country })
  );

  return {
    receiptsAvailable: overview.length,
    detailedReceipts,
  };
}

interface ProductAccumulator {
  normalizedName: string;
  displayName: string;
  aliases: Set<string>;
  receiptIds: Set<string>;
  purchaseTimestamps: number[];
  totalQuantity: number;
  unitPriceSum: number;
  unitPriceCount: number;
  linePriceSum: number;
  lineCount: number;
  lastUnitPrice: number;
  lastPurchasedTs: number;
  lastPurchasedDate: string;
  taxGroup?: string;
  storeIds: Set<string>;
}

/**
 * Aggregate line items from already-fetched receipts into ranked regular products.
 * Pure helper separated from I/O for straightforward testing and reuse.
 */
export function aggregateRegularProducts(
  receipts: Receipt[],
  options: {
    minPurchases?: number;
    excludeDeposits?: boolean;
    limit?: number;
    nowMs?: number;
  } = {}
): {
  totalUniqueItems: number;
  regularProducts: RegularProductSummary[];
} {
  const nowMs = options.nowMs ?? Date.now();
  const minPurchases = Math.max(1, options.minPurchases ?? 2);
  const excludeDeposits = options.excludeDeposits !== false;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));

  const byProduct = new Map<string, ProductAccumulator>();

  for (const receipt of receipts) {
    const receiptTs = Date.parse(receipt.date || "") || 0;
    for (const line of receipt.lines ?? []) {
      const desc = (line.description || "").trim();
      if (!desc) continue;
      if (excludeDeposits && isDepositItem(desc)) continue;

      const key = normalizeProductName(desc);
      if (!key) continue;

      const qty = line.quantity > 0 ? line.quantity : 1;
      const netLinePrice = Math.max(0, line.price - (line.discount ?? 0));
      const effectiveUnitPrice =
        typeof line.unitPrice === "number" && line.unitPrice > 0
          ? line.unitPrice
          : Number((netLinePrice / qty).toFixed(2));

      let acc = byProduct.get(key);
      if (!acc) {
        acc = {
          normalizedName: key,
          displayName: desc,
          aliases: new Set([desc]),
          receiptIds: new Set(),
          purchaseTimestamps: [],
          totalQuantity: 0,
          unitPriceSum: 0,
          unitPriceCount: 0,
          linePriceSum: 0,
          lineCount: 0,
          lastUnitPrice: effectiveUnitPrice,
          lastPurchasedTs: receiptTs,
          lastPurchasedDate: receipt.date,
          taxGroup: line.taxGroup,
          storeIds: new Set(),
        };
        byProduct.set(key, acc);
      }

      acc.aliases.add(desc);
      acc.receiptIds.add(receipt.id);
      if (receiptTs > 0) acc.purchaseTimestamps.push(receiptTs);
      acc.totalQuantity += qty;
      acc.unitPriceSum += effectiveUnitPrice;
      acc.unitPriceCount += 1;
      acc.linePriceSum += netLinePrice;
      acc.lineCount += 1;
      if (receipt.storeId) acc.storeIds.add(receipt.storeId);

      if (receiptTs >= acc.lastPurchasedTs) {
        acc.lastPurchasedTs = receiptTs;
        acc.lastPurchasedDate = receipt.date;
        acc.lastUnitPrice = effectiveUnitPrice;
        if (desc.length >= acc.displayName.length) {
          acc.displayName = desc;
        }
        if (line.taxGroup) acc.taxGroup = line.taxGroup;
      }
    }
  }

  const summaries: RegularProductSummary[] = [];
  for (const acc of byProduct.values()) {
    const purchaseCount = acc.receiptIds.size;
    if (purchaseCount < minPurchases) continue;

    const sortedDays = [...new Set(acc.purchaseTimestamps.map((ts) => Math.floor(ts / DAY_MS)))]
      .sort((a, b) => a - b);

    const averageCadenceDays =
      sortedDays.length >= 2
        ? Number(
            (
              (sortedDays[sortedDays.length - 1] - sortedDays[0]) /
              (sortedDays.length - 1)
            ).toFixed(1)
          )
        : undefined;

    const daysSinceLastPurchase =
      acc.lastPurchasedTs > 0
        ? Math.max(0, Math.floor((nowMs - acc.lastPurchasedTs) / DAY_MS))
        : 0;

    const dueForRestock = Boolean(
      averageCadenceDays &&
        averageCadenceDays > 0 &&
        daysSinceLastPurchase >= averageCadenceDays * 0.8
    );

    summaries.push({
      normalizedName: acc.normalizedName,
      displayName: acc.displayName,
      aliases: [...acc.aliases],
      purchaseCount,
      totalQuantity: Number(acc.totalQuantity.toFixed(3)),
      averageUnitPrice: Number((acc.unitPriceSum / acc.unitPriceCount).toFixed(2)),
      lastUnitPrice: Number(acc.lastUnitPrice.toFixed(2)),
      averageLinePrice: Number((acc.linePriceSum / acc.lineCount).toFixed(2)),
      lastPurchasedDate: acc.lastPurchasedDate,
      daysSinceLastPurchase,
      averageCadenceDays,
      dueForRestock,
      taxGroup: acc.taxGroup,
      storeIds: [...acc.storeIds],
    });
  }

  summaries.sort((a, b) => {
    if (b.purchaseCount !== a.purchaseCount) return b.purchaseCount - a.purchaseCount;
    return (Date.parse(b.lastPurchasedDate) || 0) - (Date.parse(a.lastPurchasedDate) || 0);
  });

  return {
    totalUniqueItems: byProduct.size,
    regularProducts: summaries.slice(0, limit),
  };
}

/**
 * Analyze purchase history for a single country ('nl' or 'de') and identify
 * regularly bought products, purchase cadence, and restock candidates.
 */
export async function getRegularProducts(
  transport: LidlTransport,
  options: GetRegularProductsOptions = {}
): Promise<RegularProductsResult> {
  const ctx = resolveCountry(options.country);
  const minPurchases = Math.max(1, options.minPurchases ?? 2);

  const { receiptsAvailable, detailedReceipts } = await fetchCountryReceiptsWithDetails(
    transport,
    {
      country: ctx.country,
      maxReceipts: options.maxReceipts,
      daysBack: options.daysBack,
      yearOffset: options.yearOffset,
      nowMs: options.nowMs,
    }
  );

  const { totalUniqueItems, regularProducts } = aggregateRegularProducts(detailedReceipts, {
    minPurchases,
    excludeDeposits: options.excludeDeposits,
    limit: options.limit,
    nowMs: options.nowMs,
  });

  const dates = detailedReceipts
    .map((r) => r.date)
    .filter(Boolean)
    .sort((a, b) => (Date.parse(a) || 0) - (Date.parse(b) || 0));

  let note: string | undefined;
  if (detailedReceipts.length === 0) {
    note = `No receipts found in ${ctx.country}.`;
  } else if (regularProducts.length === 0 && minPurchases > 1) {
    note = `Found ${totalUniqueItems} distinct items across ${detailedReceipts.length} receipt(s) in ${ctx.country}, none bought ${minPurchases}+ times yet. Retry with minPurchases: 1 to include one-off items.`;
  }

  return {
    country: ctx.country,
    receiptsAvailable,
    receiptsAnalyzed: detailedReceipts.length,
    dateRange:
      dates.length > 0
        ? { oldest: dates[0], newest: dates[dates.length - 1] }
        : undefined,
    minPurchases,
    totalUniqueItems,
    regularProducts,
    note,
  };
}

const DEFAULT_MATCH_THRESHOLD = 0.45;

function matchOffers(
  queryText: string,
  offers: LidlOfferProduct[],
  maxMatches: number
): MatchedOfferSummary[] {
  const scored: MatchedOfferSummary[] = [];
  for (const offer of offers) {
    const text = `${offer.title} ${offer.subtitle || ""} ${offer.brand || ""}`;
    const score = scoreProductMatch(queryText, text);
    if (score >= DEFAULT_MATCH_THRESHOLD) {
      scored.push({
        id: offer.id,
        title: offer.title,
        subtitle: offer.subtitle,
        brand: offer.brand,
        price: offer.price,
        campaignId: offer.campaignId,
        campaignTitle: offer.campaignTitle,
        matchScore: score,
      });
    }
  }
  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, maxMatches);
}

function matchCoupons(
  queryText: string,
  coupons: LidlCoupon[],
  maxMatches: number
): MatchedCouponSummary[] {
  const scored: MatchedCouponSummary[] = [];
  for (const coupon of coupons) {
    const text = `${coupon.title} ${coupon.discountTitle || ""} ${coupon.discountDescription || ""}`;
    const score = scoreProductMatch(queryText, text);
    if (score >= DEFAULT_MATCH_THRESHOLD) {
      scored.push({
        id: coupon.id,
        promotionId: coupon.promotionId,
        title: coupon.title,
        discountTitle: coupon.discountTitle,
        discountDescription: coupon.discountDescription,
        isActivated: coupon.isActivated,
        startDate: coupon.startDate,
        endDate: coupon.endDate,
        matchScore: score,
      });
    }
  }
  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, maxMatches);
}

export interface PlanGroceryTripOptions {
  country?: string;
  storeId?: string;
  extraItems?: string[];
  minPurchases?: number;
  maxReceipts?: number;
  daysBack?: number;
  yearOffset?: number;
  excludeDeposits?: boolean;
  maxMatchesPerItem?: number;
  nowMs?: number;
}

/**
 * Plan a grocery trip for a single country ('nl' or 'de') by matching regular
 * purchases and optional extra items against active weekly offers and coupons.
 */
export async function planGroceryTrip(
  transport: LidlTransport,
  options: PlanGroceryTripOptions = {}
): Promise<GroceryTripPlan> {
  const ctx = resolveCountry(options.country);
  const maxMatches = Math.max(1, Math.min(options.maxMatchesPerItem ?? 3, 10));

  let storeId = options.storeId;
  if (!storeId) {
    try {
      const fav = await getFavoriteStore(transport, ctx.country);
      if (fav?.storeKey) {
        storeId = String(fav.storeKey);
      }
    } catch {
      // Optional when storeId isn't explicitly provided or favorite store isn't set
    }
  }

  const [regularsRes, offersPool, couponsRes] = await Promise.all([
    getRegularProducts(transport, {
      country: ctx.country,
      minPurchases: options.minPurchases ?? 2,
      maxReceipts: options.maxReceipts,
      daysBack: options.daysBack,
      yearOffset: options.yearOffset,
      excludeDeposits: options.excludeDeposits,
      limit: 60,
      nowMs: options.nowMs,
    }),
    fetchActiveOffersPool(transport, {
      country: ctx.country,
      storeId,
    }),
    getCoupons(transport, {
      country: ctx.country,
      storeId,
    }),
  ]);

  const discountedRegulars: GroceryTripPlan["discountedRegulars"] = [];
  const dueForRestock: RegularProductSummary[] = [];
  const otherRegulars: RegularProductSummary[] = [];
  const unactivatedById = new Map<
    string,
    GroceryTripPlan["unactivatedMatchingCoupons"][number]
  >();

  const recordUnactivatedCoupons = (
    coupons: MatchedCouponSummary[],
    itemLabel: string
  ): void => {
    for (const c of coupons) {
      if (c.isActivated) continue;
      const key = c.promotionId || c.id;
      let existing = unactivatedById.get(key);
      if (!existing) {
        existing = {
          id: c.id,
          promotionId: c.promotionId,
          title: c.title,
          discountTitle: c.discountTitle,
          endDate: c.endDate,
          matchedItems: [],
        };
        unactivatedById.set(key, existing);
      }
      if (!existing.matchedItems.includes(itemLabel)) {
        existing.matchedItems.push(itemLabel);
      }
    }
  };

  for (const reg of regularsRes.regularProducts) {
    const queryText = [reg.displayName, ...reg.aliases].join(" ");
    const matchingOffers = matchOffers(queryText, offersPool.products, maxMatches);
    const matchingCoupons = matchCoupons(queryText, couponsRes.coupons, maxMatches);

    if (matchingOffers.length > 0 || matchingCoupons.length > 0) {
      discountedRegulars.push({
        regular: reg,
        matchingOffers,
        matchingCoupons,
      });
      recordUnactivatedCoupons(matchingCoupons, reg.displayName);
    } else if (reg.dueForRestock) {
      dueForRestock.push(reg);
    } else {
      otherRegulars.push(reg);
    }
  }

  const requestedItemDeals: GroceryTripPlan["requestedItemDeals"] = [];
  for (const rawItem of options.extraItems ?? []) {
    const query = rawItem.trim();
    if (!query) continue;
    const matchingOffers = matchOffers(query, offersPool.products, maxMatches);
    const matchingCoupons = matchCoupons(query, couponsRes.coupons, maxMatches);
    requestedItemDeals.push({ query, matchingOffers, matchingCoupons });
    recordUnactivatedCoupons(matchingCoupons, query);
  }

  return {
    country: ctx.country,
    storeId,
    receiptsAnalyzed: regularsRes.receiptsAnalyzed,
    minPurchases: regularsRes.minPurchases,
    campaignsChecked: offersPool.campaignsChecked,
    offersChecked: offersPool.products.length,
    couponsChecked: couponsRes.coupons.length,
    couponsAnonymousFallback: couponsRes.isAnonymousFallback,
    discountedRegulars,
    requestedItemDeals,
    dueForRestock,
    otherRegulars,
    unactivatedMatchingCoupons: [...unactivatedById.values()],
    note: regularsRes.note,
  };
}
