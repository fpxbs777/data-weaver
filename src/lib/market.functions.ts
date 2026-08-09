import { createServerFn } from "@tanstack/react-start";
import {
  fetchQuotes,
  fetchDolares,
  fetchMacro,
  fetchMepSerie,
  fetchQuote,
  type Quote,
  type MacroItem,
  type MonthlyPoint,
} from "./market.server";

export type MarketRow = {
  label: string;
  symbol: string;
  value: number;
  changePct: number;
  unit: "ARS" | "USD" | "pts" | "bps";
};

export type MercadoSnapshot = {
  indices: MarketRow[];
  divisas: MarketRow[];
  macro: MacroItem[];
  updatedAt: string;
};

export const getQuotes = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[] }) => ({
    symbols: (input?.symbols ?? []).filter((s) => typeof s === "string" && s.length > 0).slice(0, 40),
  }))
  .handler(async ({ data }): Promise<Quote[]> => fetchQuotes(data.symbols));

export const getMercado = createServerFn({ method: "GET" }).handler(
  async (): Promise<MercadoSnapshot> => {
    const INDICES: Array<{ symbol: string; label: string }> = [
      { symbol: "^MERV", label: "Merval" },
      { symbol: "^GSPC", label: "S&P 500" },
      { symbol: "^IXIC", label: "Nasdaq" },
    ];
    const [quotes, dolares, macro] = await Promise.all([
      fetchQuotes(INDICES.map((i) => i.symbol)),
      fetchDolares(),
      fetchMacro(),
    ]);

    const indices: MarketRow[] = INDICES.map((i, idx) => {
      const q = quotes[idx]!;
      return {
        label: i.label,
        symbol: i.symbol,
        value: q.price,
        changePct: q.varDia,
        unit: "pts" as const,
      };
    }).filter((r) => r.value > 0);

    if (macro.riesgoPais) {
      indices.push({
        label: "Riesgo país",
        symbol: "EMBI-AR",
        value: macro.riesgoPais.valor,
        changePct: 0,
        unit: "bps",
      });
    }

    const CASAS: string[] = ["bolsa", "contadoconliqui", "oficial", "blue", "tarjeta", "cripto"];
    const divisas: MarketRow[] = dolares
      .filter((d) => CASAS.includes(d.casa))
      .sort((a, b) => CASAS.indexOf(a.casa) - CASAS.indexOf(b.casa))
      .map((d) => ({
        label: `Dólar ${d.label}`,
        symbol: d.casa.toUpperCase(),
        value: d.value,
        changePct: d.changePct,
        unit: "ARS" as const,
      }));

    return { indices, divisas, macro: macro.items, updatedAt: new Date().toISOString() };
  },
);

export type Benchmarks = { merval: MonthlyPoint[]; mep: MonthlyPoint[] };

export const getBenchmarks = createServerFn({ method: "GET" }).handler(
  async (): Promise<Benchmarks> => {
    const [merval, mep] = await Promise.all([fetchQuote("^MERV"), fetchMepSerie()]);
    return { merval: merval.monthly, mep };
  },
);

export type { Quote, MacroItem, MonthlyPoint };
