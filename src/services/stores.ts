import { resolveCountry } from "../countries.js";
import { mapStore } from "../mappers.js";
import { StoreInfo, StoreSchedule } from "../types.js";
import { LidlTransport } from "./transport.js";

export async function searchStores(
  transport: LidlTransport,
  options: {
    query?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    limit?: number;
  } = {}
): Promise<StoreInfo[]> {
  const ctx = resolveCountry(options.country);
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));

  if (
    typeof options.latitude === "number" &&
    typeof options.longitude === "number"
  ) {
    const raw = await transport.request<any[]>(
      `/api/v1/autocomplete/${ctx.country}`,
      {
        host: "stores",
        country: ctx.country,
        language: ctx.language,
        authMode: "none",
        query: {
          input: options.query || "",
          language: ctx.language,
          latitude: options.latitude,
          longitude: options.longitude,
        },
      }
    );
    return (Array.isArray(raw) ? raw : [])
      .slice(0, limit)
      .map((s) => mapStore(s, ctx.country));
  }

  const all = await transport.request<any[]>(`/api/v4/${ctx.country}`, {
    host: "stores",
    country: ctx.country,
    language: ctx.language,
    authMode: "none",
  });

  const q = (options.query || "").trim().toLowerCase();
  const list = Array.isArray(all) ? all : [];
  const filtered = q
    ? list.filter((s) => {
        const hay = [
          s?.storeKey,
          s?.name,
          s?.locality,
          s?.postalCode,
          s?.address,
          s?.state,
          s?.province,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : list;

  return filtered.slice(0, limit).map((s) => mapStore(s, ctx.country));
}

export async function getStoreDetails(
  transport: LidlTransport,
  options: {
    storeId: string;
    date?: string;
    country?: string;
  }
): Promise<StoreInfo> {
  const ctx = resolveCountry(options.country);
  const scheduleDate = options.date || new Date().toISOString().slice(0, 10);

  const [detailsList, schedule] = await Promise.all([
    transport.request<any[]>(`/api/v5/${ctx.country}/details`, {
      host: "stores",
      country: ctx.country,
      language: ctx.language,
      authMode: "none",
      headers: {
        storesIds: options.storeId,
      },
    }),
    transport
      .request<StoreSchedule>(`/api/v3/schedule/${encodeURIComponent(options.storeId)}`, {
        host: "stores",
        country: ctx.country,
        language: ctx.language,
        authMode: "none",
        query: { date: scheduleDate },
      })
      .catch(() => undefined),
  ]);

  const raw = Array.isArray(detailsList) ? detailsList[0] : detailsList;
  if (!raw) {
    throw new Error(`Store ${options.storeId} not found in ${ctx.isoCountryCode}`);
  }

  return {
    ...mapStore(raw, ctx.country),
    schedule,
  };
}

export async function getFavoriteStore(
  transport: LidlTransport,
  country?: string
): Promise<any> {
  const ctx = resolveCountry(country);
  return transport.request(`/api/v1/users/me/favorite/${ctx.country}`, {
    host: "stores",
    country: ctx.country,
    language: ctx.language,
    authMode: "required",
  });
}

export async function setFavoriteStore(
  transport: LidlTransport,
  storeKey: string,
  country?: string
): Promise<any> {
  const ctx = resolveCountry(country);
  const res = await transport.request(`/api/v1/users/me/favorite/${ctx.country}`, {
    host: "stores",
    country: ctx.country,
    language: ctx.language,
    method: "PUT",
    body: { storeKey },
    authMode: "required",
  });
  transport.invalidateCache(`GET /api/v1/users/me/favorite/${ctx.country}`);
  return res;
}
