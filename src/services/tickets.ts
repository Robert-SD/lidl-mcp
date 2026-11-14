import { resolveCountry } from "../countries.js";
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
  return list.map(mapReceipt);
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
  return mapReceipt(raw);
}

export async function getReceiptSummary(
  transport: LidlTransport,
  options: { ticketId: string; country?: string }
): Promise<any> {
  const ctx = resolveCountry(options.country);
  return transport.request(
    `/api/v3/${ctx.country}/tickets/${encodeURIComponent(options.ticketId)}/summary`,
    {
      host: "tickets",
      country: ctx.country,
      language: ctx.language,
      authMode: "required",
    }
  );
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
  return res;
}
