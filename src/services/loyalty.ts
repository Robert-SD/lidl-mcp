import { resolveCountry } from "../countries.js";
import { MemberProfile } from "../types.js";
import { LidlTransport } from "./transport.js";

export async function getProfile(
  transport: LidlTransport,
  country?: string
): Promise<MemberProfile> {
  const ctx = resolveCountry(country);
  const [userInfo, loyalty] = await Promise.all([
    transport.request<any>("/connect/userinfo", {
      host: "accounts",
      country: ctx.country,
      language: ctx.language,
      authMode: "required",
    }),
    transport
      .request<any>(`/api/v1/${ctx.country}/loyalty`, {
        host: "profile",
        country: ctx.country,
        language: ctx.language,
        authMode: "required",
      })
      .catch(() => null),
  ]);

  return {
    sub: userInfo?.sub || undefined,
    name:
      userInfo?.name ||
      [userInfo?.given_name, userInfo?.family_name].filter(Boolean).join(" ") ||
      undefined,
    givenName: userInfo?.given_name || undefined,
    familyName: userInfo?.family_name || undefined,
    email: userInfo?.email || undefined,
    emailVerified:
      typeof userInfo?.email_verified === "boolean"
        ? userInfo.email_verified
        : undefined,
    phoneNumber: userInfo?.phone_number || undefined,
    loyaltyCardNumber: loyalty?.code || loyalty?.cardNumber || loyalty?.loyaltyId || undefined,
    qrCode: loyalty?.qrCode || undefined,
    country: ctx.country,
    rawLoyalty: loyalty ?? undefined,
  };
}

export async function getLoyaltySummary(
  transport: LidlTransport,
  options: { country?: string; storeId?: string } = {}
): Promise<any> {
  const ctx = resolveCountry(options.country);
  const [summary, stampcards, deposits] = await Promise.allSettled([
    transport.request(`/api/v2/${ctx.country}/summary`, {
      host: "loyaltytab",
      country: ctx.country,
      language: ctx.language,
      authMode: "required",
    }),
    transport.request(`/api/v3/${ctx.country}/user/promotions`, {
      host: "stampcard",
      country: ctx.country,
      language: ctx.language,
      query: options.storeId ? { storeId: options.storeId } : undefined,
      authMode: "required",
    }),
    transport.request(`/api/v1/${ctx.country}/deposits`, {
      host: "deposits",
      country: ctx.country,
      language: ctx.language,
      authMode: "required",
    }),
  ]);

  return {
    country: ctx.country,
    loyaltySummary:
      summary.status === "fulfilled"
        ? summary.value
        : { error: (summary.reason as Error)?.message },
    stampcards:
      stampcards.status === "fulfilled"
        ? stampcards.value
        : { error: (stampcards.reason as Error)?.message },
    deposits:
      deposits.status === "fulfilled"
        ? deposits.value
        : { error: (deposits.reason as Error)?.message },
  };
}
