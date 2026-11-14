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
  name?: string;
  email?: string;
  loyaltyCardNumber?: string;
  country?: string;
  preferredStoreId?: string | number;
  memberId?: string;
}

export interface LidlPrice {
  now: number;
  was?: number;
  currency?: string;
  unitSizeDescription?: string;
}

export interface LidlProduct {
  id: string | number;
  title: string;
  brand?: string;
  summary?: string;
  price: LidlPrice;
  unitPriceDescription?: string;
  onOffer?: boolean;
  images?: Array<{ url: string; width?: number; height?: number }>;
  category?: string;
  url?: string;
}

export interface LidlCoupon {
  id: string;
  title: string;
  description?: string;
  discountText?: string;
  status?: "available" | "activated" | "redeemed" | "expired" | string;
  startDate?: string;
  endDate?: string;
  imageUrl?: string;
}

export interface LidlOffer {
  id: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  price?: LidlPrice;
  products?: LidlProduct[];
}

export interface ShoppingListItem {
  id?: string | number;
  type: "FREE_TEXT" | "PRODUCT";
  text?: string;
  productId?: string | number;
  product?: LidlProduct;
  quantity?: number;
  checked?: boolean;
}

export interface ShoppingList {
  id?: string;
  items: ShoppingListItem[];
  totalItems: number;
}

export interface ReceiptLine {
  description: string;
  quantity: number;
  price: number;
  discount?: number;
  unitPrice?: number;
}

export interface Receipt {
  id: string;
  date: string;
  total: number;
  totalDiscount?: number;
  storeId?: string | number;
  storeName?: string;
  lines?: ReceiptLine[];
}

export interface StoreInfo {
  id: string | number;
  name: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  openingHours?: Array<{ day: string; open: string; close: string }>;
}

export interface AuthSessionStatus {
  authenticated: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  savedAt?: string;
  tokensFile: string;
  configured: boolean;
}
