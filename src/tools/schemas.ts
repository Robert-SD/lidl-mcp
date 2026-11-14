import { z } from "zod";

const looseObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).loose();

// ─── Shared Domain Schemas ────────────────────────────────────────────────────

export const memberProfileSchema = looseObject({
  sub: z.string().optional(),
  name: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  email: z.string().optional(),
  emailVerified: z.boolean().optional(),
  phoneNumber: z.string().optional(),
  loyaltyCardNumber: z.string().optional(),
  qrCode: z.string().optional(),
  country: z.string().optional(),
  preferredStoreId: z.string().optional(),
  rawLoyalty: z.unknown().optional(),
});

export const priceSchema = looseObject({
  now: z.number(),
  was: z.number().optional(),
  currency: z.string().optional(),
  discountLabel: z.string().optional(),
  disclaimers: z.array(z.string()).optional(),
});

export const offerProductSchema = looseObject({
  id: z.string(),
  wawiId: z.string().optional(),
  articleNumber: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  additionalInfo: z.string().optional(),
  brand: z.string().optional(),
  description: z.string().optional(),
  price: priceSchema.optional(),
  imageUrl: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
  badges: z
    .array(looseObject({ type: z.string().optional(), title: z.string().optional() }))
    .optional(),
  isOnline: z.boolean().optional(),
  isStore: z.boolean().optional(),
  campaignId: z.string().optional(),
  campaignTitle: z.string().optional(),
});

export const campaignSchema = looseObject({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  kind: z.string().optional(),
  imageUrl: z.string().optional(),
  groupTitle: z.string().optional(),
});

export const brochureSchema = looseObject({
  id: z.string(),
  title: z.string(),
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startLocalDate: z.string().optional(),
  endLocalDate: z.string().optional(),
  offerStartDate: z.string().optional(),
  offerEndDate: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  viewUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
  groupName: z.string().optional(),
});

export const couponSchema = looseObject({
  id: z.string(),
  promotionId: z.string().optional(),
  title: z.string(),
  discountTitle: z.string().optional(),
  discountDescription: z.string().optional(),
  status: z.string().optional(),
  isActivated: z.boolean(),
  isSpecial: z.boolean().optional(),
  specialTag: z.string().optional(),
  channel: z.string().optional(),
  channels: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startLocalDate: z.string().optional(),
  endLocalDate: z.string().optional(),
  imageUrl: z.string().optional(),
  section: z.string().optional(),
  stores: z.array(z.string()).optional(),
});

export const receiptLineSchema = looseObject({
  description: z.string(),
  quantity: z.number(),
  price: z.number(),
  discount: z.number().optional(),
  unitPrice: z.number().optional(),
  taxGroup: z.string().optional(),
});

export const receiptSchema = looseObject({
  id: z.string(),
  date: z.string(),
  localDate: z.string().optional(),
  total: z.number(),
  totalDiscount: z.number().optional(),
  currency: z.string().optional(),
  storeId: z.string().optional(),
  storeName: z.string().optional(),
  isFavorite: z.boolean().optional(),
  lines: z.array(receiptLineSchema).optional(),
});

export const storeScheduleSchema = looseObject({
  isOpen: z.boolean().optional(),
  isTemporarilyClosed: z.boolean().optional(),
  isPermanentlyClosed: z.boolean().optional(),
  openingHours: z
    .array(looseObject({ from: z.string(), to: z.string() }))
    .optional(),
  willOpenAt: looseObject({
    day: z.number().optional(),
    hour: z.string().optional(),
  }).optional(),
});

export const storeInfoSchema = looseObject({
  storeKey: z.string(),
  name: z.string(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  locality: z.string().optional(),
  state: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  isLidlPlus: z.boolean().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  distanceMeters: z.number().optional(),
  zone: z.string().optional(),
  showOfferRegion: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  schedule: storeScheduleSchema.optional(),
});

export const regularProductSchema = looseObject({
  normalizedName: z.string(),
  displayName: z.string(),
  aliases: z.array(z.string()),
  purchaseCount: z.number(),
  totalQuantity: z.number(),
  averageUnitPrice: z.number(),
  lastUnitPrice: z.number(),
  averageLinePrice: z.number(),
  lastPurchasedDate: z.string(),
  lastPurchasedLocalDate: z.string().optional(),
  daysSinceLastPurchase: z.number(),
  averageCadenceDays: z.number().optional(),
  dueForRestock: z.boolean(),
  taxGroup: z.string().optional(),
  storeIds: z.array(z.string()),
});

export const matchedOfferSchema = looseObject({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  brand: z.string().optional(),
  price: priceSchema.optional(),
  campaignId: z.string().optional(),
  campaignTitle: z.string().optional(),
  matchScore: z.number(),
});

export const matchedCouponSchema = looseObject({
  id: z.string(),
  promotionId: z.string().optional(),
  title: z.string(),
  discountTitle: z.string().optional(),
  discountDescription: z.string().optional(),
  isActivated: z.boolean(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startLocalDate: z.string().optional(),
  endLocalDate: z.string().optional(),
  matchScore: z.number(),
});

// ─── Tool Output Schemas ──────────────────────────────────────────────────────

export const loginOutputSchema = looseObject({
  status: z.enum(["unauthenticated", "authenticated", "token_present"]),
  authenticated: z.boolean(),
  hasAccessToken: z.boolean(),
  hasRefreshToken: z.boolean(),
  savedAt: z.string().optional(),
  tokensFile: z.string(),
  configured: z.boolean(),
  defaultCountry: z.string(),
  defaultLanguage: z.string(),
  profile: memberProfileSchema.optional(),
  profileError: z.string().optional(),
});

export const loyaltyProgramOutputSchema = looseObject({
  country: z.string(),
  storeId: z.string().optional(),
  loyaltySummary: z.unknown(),
  stampcards: z.unknown(),
  deposits: z.unknown(),
});

export const cacheStatsOutputSchema = looseObject({
  enabled: z.boolean(),
  scope: z.literal("process"),
  maxEntries: z.number().int(),
  hits: z.number().int(),
  misses: z.number().int(),
  sets: z.number().int(),
  evictions: z.number().int(),
  entries: z.number().int(),
  hitRate: z.number(),
  note: z.string().optional(),
});

export const searchStoresOutputSchema = looseObject({
  count: z.number().int(),
  stores: z.array(storeInfoSchema),
});

export const favoriteStoreOutputSchema = looseObject({
  storeKey: z.string().nullable().optional(),
  storeId: z.string().nullable().optional(),
});

export const setFavoriteStoreOutputSchema = looseObject({
  updated: z.boolean().optional(),
  storeId: z.string().optional(),
  storeKey: z.string().optional(),
  country: z.string().optional(),
});

export const brochuresOutputSchema = looseObject({
  count: z.number().int(),
  brochures: z.array(brochureSchema),
});

export const campaignGroupsOutputSchema = looseObject({
  count: z.number().int(),
  groups: z.array(
    looseObject({
      title: z.string(),
      campaigns: z.array(campaignSchema),
    })
  ),
});

export const campaignOffersOutputSchema = looseObject({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  products: z.array(offerProductSchema),
});

export const searchOffersOutputSchema = looseObject({
  country: z.string(),
  storeId: z.string().optional(),
  campaignsChecked: z.number().int(),
  total: z.number().int(),
  offers: z.array(offerProductSchema),
});

export const shopProductOutputSchema = looseObject({
  productErp: z.string().optional(),
  title: z.string().optional(),
});

export const couponsOutputSchema = looseObject({
  country: z.string(),
  isAnonymousFallback: z.boolean(),
  coupons: z.array(couponSchema),
});

export const couponDetailsOutputSchema = looseObject({
  id: z.string().optional(),
  promotionId: z.string().optional(),
  title: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startLocalDate: z.string().optional(),
  endLocalDate: z.string().optional(),
});

export const couponActivationOutputSchema = looseObject({
  activated: z.boolean().optional(),
  deactivated: z.boolean().optional(),
  promotionId: z.string(),
  country: z.string(),
  response: z.unknown().optional(),
});

export const couponPlusOutputSchema = looseObject({
  active: z.boolean().optional(),
  country: z.string().optional(),
  message: z.string().optional(),
});

export const listReceiptsOutputSchema = looseObject({
  count: z.number().int(),
  receipts: z.array(receiptSchema),
});

export const receiptSummaryOutputSchema = looseObject({
  ticketId: z.string().optional(),
  origin: z.string().optional(),
  date: z.string().optional(),
  localDate: z.string().optional(),
  purchaseAmountWithoutCurrency: z.number().optional(),
  purchaseSavingsWithoutCurrency: z.number().optional(),
  purchaseAmount: z.unknown().optional(),
  purchaseSavings: z.unknown().optional(),
  isDeletedTicket: z.boolean().optional(),
  vendor: z.string().optional(),
  isHtml: z.boolean().optional(),
  hasHtmlDocument: z.boolean().optional(),
});

export const setReceiptFavoriteOutputSchema = looseObject({
  updated: z.boolean().optional(),
  ticketId: z.string().optional(),
  favorite: z.boolean().optional(),
  country: z.string().optional(),
});

export const regularProductsOutputSchema = looseObject({
  country: z.string(),
  receiptsAvailable: z.number().int(),
  receiptsAnalyzed: z.number().int(),
  dateRange: looseObject({
    oldest: z.string(),
    newest: z.string(),
  }).optional(),
  minPurchases: z.number().int(),
  totalUniqueItems: z.number().int(),
  regularProducts: z.array(regularProductSchema),
  note: z.string().optional(),
});

export const groceryTripPlanOutputSchema = looseObject({
  country: z.string(),
  storeId: z.string().optional(),
  receiptsAnalyzed: z.number().int(),
  minPurchases: z.number().int(),
  campaignsChecked: z.number().int(),
  offersChecked: z.number().int(),
  couponsChecked: z.number().int(),
  couponsAnonymousFallback: z.boolean(),
  discountedRegulars: z.array(
    looseObject({
      regular: regularProductSchema,
      matchingOffers: z.array(matchedOfferSchema),
      matchingCoupons: z.array(matchedCouponSchema),
    })
  ),
  requestedItemDeals: z.array(
    looseObject({
      query: z.string(),
      matchingOffers: z.array(matchedOfferSchema),
      matchingCoupons: z.array(matchedCouponSchema),
    })
  ),
  dueForRestock: z.array(regularProductSchema),
  otherRegulars: z.array(regularProductSchema),
  unactivatedMatchingCoupons: z.array(
    looseObject({
      id: z.string(),
      promotionId: z.string().optional(),
      title: z.string(),
      discountTitle: z.string().optional(),
      endDate: z.string().optional(),
      endLocalDate: z.string().optional(),
      matchedItems: z.array(z.string()),
    })
  ),
  note: z.string().optional(),
});
