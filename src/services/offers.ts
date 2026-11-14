import { mapWithConcurrency } from "../concurrency.js";
import { resolveCountry } from "../countries.js";
import { mapBrochure, mapCampaign, mapOfferProduct } from "../mappers.js";
import { LidlBrochure, LidlCampaign, LidlOfferProduct } from "../types.js";
import { LidlTransport } from "./transport.js";

export async function getBrochures(
  transport: LidlTransport,
  options: { country?: string; storeId?: string } = {}
): Promise<LidlBrochure[]> {
  const ctx = resolveCountry(options.country);
  const raw = await transport.request<any[]>(
    `/api/v2/${ctx.country}/Brochures`,
    {
      host: "brochures",
      country: ctx.country,
      language: ctx.language,
      authMode: "none",
      query: options.storeId ? { store: options.storeId } : undefined,
    }
  );

  const brochures: LidlBrochure[] = [];
  for (const group of Array.isArray(raw) ? raw : []) {
    const groupName = group?.name || undefined;
    for (const flyer of Array.isArray(group?.flyers) ? group.flyers : []) {
      brochures.push(mapBrochure(flyer, groupName));
    }
  }
  return brochures;
}

export async function getCampaignGroups(
  transport: LidlTransport,
  options: { country?: string; storeId?: string } = {}
): Promise<Array<{ title: string; campaigns: LidlCampaign[] }>> {
  const ctx = resolveCountry(options.country);
  const raw = await transport.request<any>(
    `/api/v1/${ctx.country}/campaignGroups`,
    {
      host: "leaflet",
      country: ctx.country,
      language: ctx.language,
      authMode: "none",
      query: options.storeId ? { storeId: options.storeId } : undefined,
    }
  );

  return (Array.isArray(raw?.groups) ? raw.groups : []).map((g: any) => ({
    title: String(g?.title || ""),
    campaigns: (Array.isArray(g?.campaigns) ? g.campaigns : []).map((c: any) =>
      mapCampaign(c, g?.title)
    ),
  }));
}

export async function getCampaignOffers(
  transport: LidlTransport,
  options: { campaignId: string; country?: string; storeId?: string }
): Promise<{
  id: string;
  title: string;
  subtitle?: string;
  products: LidlOfferProduct[];
}> {
  const ctx = resolveCountry(options.country);
  const raw = await transport.request<any>(
    `/api/v1/${ctx.country}/campaigns/${encodeURIComponent(options.campaignId)}`,
    {
      host: "leaflet",
      country: ctx.country,
      language: ctx.language,
      authMode: "none",
      query: options.storeId ? { storeId: options.storeId } : undefined,
    }
  );

  const campaign = { id: String(raw?.id || options.campaignId), title: raw?.title };
  return {
    id: campaign.id,
    title: String(raw?.title || ""),
    subtitle: raw?.subtitle || undefined,
    products: (Array.isArray(raw?.products) ? raw.products : []).map((p: any) =>
      mapOfferProduct(p, campaign)
    ),
  };
}

export async function searchOffers(
  transport: LidlTransport,
  options: {
    query?: string;
    country?: string;
    storeId?: string;
    limit?: number;
  } = {}
): Promise<{
  country: string;
  storeId?: string;
  campaignsChecked: number;
  total: number;
  offers: LidlOfferProduct[];
}> {
  const ctx = resolveCountry(options.country);
  const limit = Math.max(1, Math.min(options.limit ?? 30, 200));
  const groups = await getCampaignGroups(transport, {
    country: ctx.country,
    storeId: options.storeId,
  });

  const campaigns = groups.flatMap((g) => g.campaigns).slice(0, 8);
  const details = await mapWithConcurrency(campaigns, 4, async (c) => {
    try {
      return await getCampaignOffers(transport, {
        campaignId: c.id,
        country: ctx.country,
        storeId: options.storeId,
      });
    } catch {
      return { id: c.id, title: c.title, products: [] };
    }
  });

  const allProducts = details.flatMap((d) => d.products);
  const q = (options.query || "").trim().toLowerCase();
  const matched = q
    ? allProducts.filter((p) =>
        `${p.title} ${p.subtitle || ""} ${p.brand || ""} ${p.additionalInfo || ""}`
          .toLowerCase()
          .includes(q)
      )
    : allProducts;

  return {
    country: ctx.country,
    storeId: options.storeId,
    campaignsChecked: campaigns.length,
    total: matched.length,
    offers: matched.slice(0, limit),
  };
}

export async function getLeafletProduct(
  transport: LidlTransport,
  options: { productId: string; country?: string; storeId?: string }
): Promise<LidlOfferProduct> {
  const ctx = resolveCountry(options.country);
  const raw = await transport.request<any>(
    `/api/v1/${ctx.country}/products/${encodeURIComponent(options.productId)}`,
    {
      host: "leaflet",
      country: ctx.country,
      language: ctx.language,
      authMode: "none",
      query: options.storeId ? { storeId: options.storeId } : undefined,
    }
  );
  return mapOfferProduct(raw);
}

export async function getShopProduct(
  transport: LidlTransport,
  options: { productErp: string; country?: string }
): Promise<any> {
  const ctx = resolveCountry(options.country);
  return transport.request(
    `/p/api/detail/${encodeURIComponent(options.productErp)}/${ctx.isoCountryCode}/${ctx.language}`,
    {
      host: "shop",
      country: ctx.country,
      language: ctx.language,
      authMode: "none",
    }
  );
}
