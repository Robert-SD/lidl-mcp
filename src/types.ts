export interface TokensData {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  saved_at?: string;
  is_anonymous?: boolean;
}

export interface MemberProfile {
  sub?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  emailVerified?: boolean;
  phoneNumber?: string;
  loyaltyCardNumber?: string;
  qrCode?: string;
  country?: string;
  preferredStoreId?: string;
  rawLoyalty?: any;
}

export interface LidlPrice {
  now: number;
  was?: number;
  currency?: string;
  discountLabel?: string;
  disclaimers?: string[];
}

export interface LidlOfferProduct {
  id: string;
  wawiId?: string;
  articleNumber?: string;
  title: string;
  subtitle?: string;
  additionalInfo?: string;
  brand?: string;
  description?: string;
  price?: LidlPrice;
  imageUrl?: string;
  imageUrls?: string[];
  badges?: Array<{ type?: string; title?: string }>;
  isOnline?: boolean;
  isStore?: boolean;
  campaignId?: string;
  campaignTitle?: string;
}

export interface LidlCampaign {
  id: string;
  title: string;
  subtitle?: string;
  kind?: string;
  imageUrl?: string;
  groupTitle?: string;
}

export interface LidlBrochure {
  id: string;
  title: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  offerStartDate?: string;
  offerEndDate?: string;
  thumbnailUrl?: string;
  viewUrl?: string;
  downloadUrl?: string;
  groupName?: string;
}

export interface LidlCoupon {
  id: string;
  promotionId?: string;
  title: string;
  discountTitle?: string;
  discountDescription?: string;
  status?: string;
  isActivated: boolean;
  isSpecial?: boolean;
  specialTag?: string;
  channel?: string;
  channels?: string[];
  startDate?: string;
  endDate?: string;
  imageUrl?: string;
  section?: string;
  stores?: string[];
}

export interface ReceiptLine {
  description: string;
  quantity: number;
  price: number;
  discount?: number;
  unitPrice?: number;
  taxGroup?: string;
}

export interface Receipt {
  id: string;
  date: string;
  total: number;
  totalDiscount?: number;
  currency?: string;
  storeId?: string;
  storeName?: string;
  isFavorite?: boolean;
  lines?: ReceiptLine[];
  raw?: any;
}

export interface StoreScheduleEntry {
  from: string;
  to: string;
}

export interface StoreSchedule {
  isOpen?: boolean;
  isTemporarilyClosed?: boolean;
  isPermanentlyClosed?: boolean;
  openingHours?: StoreScheduleEntry[];
  willOpenAt?: { day?: number; hour?: string };
}

export interface StoreInfo {
  storeKey: string;
  name: string;
  address?: string;
  postalCode?: string;
  locality?: string;
  state?: string;
  province?: string;
  country?: string;
  isLidlPlus?: boolean;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  zone?: string;
  showOfferRegion?: string;
  amenities?: string[];
  schedule?: StoreSchedule;
}

export interface AuthSessionStatus {
  authenticated: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  savedAt?: string;
  tokensFile: string;
  configured: boolean;
  defaultCountry: string;
  defaultLanguage: string;
}
