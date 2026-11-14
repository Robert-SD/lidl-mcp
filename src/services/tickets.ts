import { resolveCountry } from "../countries.js";
import { normalizeTimestamp } from "../dates.js";
import { mapReceipt } from "../mappers.js";
import { Receipt } from "../types.js";
import { LidlTransport } from "./transport.js";

export async function listReceipts(
  transport: LidlTransport,
  options: { country?: string; yearOffset?: number } = {}
): Promise<Receipt[]> {
  const ctx = resolveCountry(options.country);
  const raw = await transport.request<any>(`/api/v3/${ctx.country}/tickets`, {
    host: "tickets",
    country: ctx.country,
    language: ctx.language,
    query:
      typeof options.yearOffset === "number"
        ? { yearOffset: options.yearOffset }
        : undefined,
    authMode: "required",
  });

  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.tickets)
      ? raw.tickets
      : [];
  return list.map((item: any) => mapReceipt(item, ctx.country));
}

export async function getReceiptDetails(
  transport: LidlTransport,
  options: { ticketId: string; country?: string }
): Promise<Receipt> {
  const ctx = resolveCountry(options.country);
  const raw = await transport.request<any>(
    `/api/v3/${ctx.country}/tickets/${encodeURIComponent(options.ticketId)}`,
    {
      host: "tickets",
      country: ctx.country,
      language: ctx.language,
      authMode: "required",
    }
  );
  return mapReceipt(raw, ctx.country);
}

export async function getReceiptSummary(
  transport: LidlTransport,
  options: { ticketId: string; country?: string }
): Promise<any> {
  const ctx = resolveCountry(options.country);
  const raw = await transport.request<any>(
    `/api/v3/${ctx.country}/tickets/${encodeURIComponent(options.ticketId)}/summary`,
    {
      host: "tickets",
      country: ctx.country,
      language: ctx.language,
      authMode: "required",
    }
  );
  if (raw && typeof raw === "object" && typeof raw.date === "string") {
    const norm = normalizeTimestamp(raw.date, ctx.zoneId, { naiveAs: "utc" });
    if (norm) {
      return { ...raw, date: norm.iso, localDate: norm.localDate };
    }
  }
  return raw;
}

export async function setReceiptFavorite(
  transport: LidlTransport,
  options: { ticketId: string; favorite: boolean; country?: string }
): Promise<any> {
  const ctx = resolveCountry(options.country);
  const action = options.favorite ? "favorite" : "unfavorite";
  const res = await transport.request(`/api/v2/${ctx.country}/tickets/${action}`, {
    host: "tickets",
    country: ctx.country,
    language: ctx.language,
    method: "POST",
    body: { ticketId: options.ticketId },
    authMode: "required",
  });
  transport.invalidateCache(`GET /api/v3/${ctx.country}/tickets`);
  return (
    res ?? {
      updated: true,
      ticketId: options.ticketId,
      favorite: options.favorite,
      country: ctx.country,
    }
  );
}
