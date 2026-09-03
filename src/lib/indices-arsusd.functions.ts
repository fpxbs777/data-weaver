import { createServerFn } from "@tanstack/react-start";
import { fetchIndiceArsUsd, fetchIndicesArsUsdBatch, searchTickers, type IndiceArsUsdRow, type TickerSearchItem } from "./indices-arsusd.server";

export type { IndiceArsUsdRow, TickerSearchItem };

export const getIndicesArsUsd = createServerFn({ method: "POST" })
  .validator((input: { items: { ticker: string; mercado: string }[] }) => {
    const items = (input?.items ?? [])
      .filter((it) => it && typeof it.ticker === "string" && typeof it.mercado === "string")
      .map((it) => ({ ticker: it.ticker.slice(0, 20).trim(), mercado: it.mercado.slice(0, 12).trim() }))
      .filter((it) => it.ticker.length > 0)
      .slice(0, 30);
    return { items };
  })
  .handler(async ({ data }): Promise<IndiceArsUsdRow[]> => fetchIndicesArsUsdBatch(data.items));

export const getIndiceArsUsd = createServerFn({ method: "POST" })
  .validator((input: { ticker: string; mercado: string }) => ({
    ticker: (input?.ticker ?? "").slice(0, 20).trim(),
    mercado: (input?.mercado ?? "BCBA").slice(0, 12).trim() || "BCBA",
  }))
  .handler(async ({ data }): Promise<IndiceArsUsdRow> => fetchIndiceArsUsd(data.ticker, data.mercado));

export const searchTickersFn = createServerFn({ method: "POST" })
  .validator((input: { q: string; mercado?: string }) => ({
    q: (input?.q ?? "").slice(0, 24).trim(),
    mercado: input?.mercado ? String(input.mercado).slice(0, 12).trim() : undefined,
  }))
  .handler(async ({ data }): Promise<TickerSearchItem[]> => searchTickers(data.q, data.mercado));
