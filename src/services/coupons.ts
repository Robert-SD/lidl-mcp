import { getOptionalAccessToken } from "../auth.js";
import { resolveCountry } from "../countries.js";
import { mapCoupon } from "../mappers.js";
import { LidlCoupon } from "../types.js";
import { LidlTransport } from "./transport.js";

function flattenPromotionSections(raw: any): LidlCoupon[] {
  const out: LidlCoupon[] = [];
  for (const sec of Array.isArray(raw?.sections) ? raw.sections : []) {
    const sectionName = sec?.name || undefined;
    for (const promo of Array.isArray(sec?.promotions) ? sec.promotions : []) {
      out.push(mapCoupon(promo, sectionName));
    }
  }
  return out;
}

export async function getCoupons(
  transport: LidlTransport,
  options: { country?: string; storeId?: string; zone?: string } = {}
): Promise<{
  country: string;
  isAnonymousFallback: boolean;
  coupons: LidlCoupon[];
}> {
  const ctx = resolveCountry(options.country);
  const headers: Record<string, string> = {
    Country: ctx.isoCountryCode,
    ...(options.storeId ? { "Store-Id": options.storeId } : {}),
    ...(options.zone ? { Zone: options.zone } : {}),
  };

  const token = await getOptionalAccessToken();
  if (token) {
    const raw = await transport.request<any>("/app/api/v4/promotionslist", {
      host: "coupons",
      country: ctx.country,
      language: ctx.language,
      headers,
      authMode: "required",
    });
    return {
      country: ctx.country,
      isAnonymousFallback: false,
      coupons: flattenPromotionSections(raw),
    };
  }

  const raw = await transport.request<any>(
    "/app/api/v4/promotionslist/anonymous",
    {
      host: "coupons",
      country: ctx.country,
      language: ctx.language,
      headers,
      authMode: "none",
    }
  );
  return {
    country: ctx.country,
    isAnonymousFallback: true,
    coupons: flattenPromotionSections(raw),
  };
}

export async function getCouponDetails(
  transport: LidlTransport,
  options: { promotionId: string; country?: string }
): Promise<any> {
  const ctx = resolveCountry(options.country);
  return transport.request(
    `/app/api/v4/promotionsdetails/${encodeURIComponent(options.promotionId)}`,
    {
      host: "coupons",
      country: ctx.country,
      language: ctx.language,
      headers: { Country: ctx.isoCountryCode },
      authMode: "required",
    }
  );
}

export async function activateCoupon(
  transport: LidlTransport,
  options: { promotionId: string; country?: string; actionLocation?: string }
): Promise<any> {
  const ctx = resolveCountry(options.country);
  const res = await transport.request(
    `/app/api/v2/promotions/${encodeURIComponent(options.promotionId)}/activation`,
    {
      host: "coupons",
      country: ctx.country,
      language: ctx.language,
      method: "POST",
      headers: {
        Country: ctx.isoCountryCode,
        "Action-Location": options.actionLocation || "CouponList",
      },
      body: {},
      authMode: "required",
    }
  );
  transport.invalidateCache("GET /app/api/v4/promotionslist");
  return {
    activated: true,
    promotionId: options.promotionId,
    country: ctx.country,
    response: res ?? null,
  };
}

export async function deactivateCoupon(
  transport: LidlTransport,
  options: { promotionId: string; country?: string; actionLocation?: string }
): Promise<any> {
  const ctx = resolveCountry(options.country);
  const res = await transport.request(
    `/app/api/v2/promotions/${encodeURIComponent(options.promotionId)}/activation`,
    {
      host: "coupons",
      country: ctx.country,
      language: ctx.language,
      method: "DELETE",
      headers: {
        Country: ctx.isoCountryCode,
        "Action-Location": options.actionLocation || "CouponList",
      },
      authMode: "required",
    }
  );
  transport.invalidateCache("GET /app/api/v4/promotionslist");
  return {
    deactivated: true,
    promotionId: options.promotionId,
    country: ctx.country,
    response: res ?? null,
  };
}

export async function getCouponPlus(
  transport: LidlTransport,
  country?: string
): Promise<any> {
  const ctx = resolveCountry(country);
  try {
    return await transport.request(`/api/v4/${ctx.country}/user/promotions`, {
      host: "couponplus",
      country: ctx.country,
      language: ctx.language,
      authMode: "required",
    });
  } catch (err: any) {
    if (err?.status === 404) {
      return {
        active: false,
        country: ctx.country,
        message: "No active Coupon Plus promotion found for this country.",
      };
    }
    throw err;
  }
}
