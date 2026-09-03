/**
 * Real market data fetchers (server-only).
 * Sources: Yahoo Finance (chart API), DolarApi / ArgentinaDatos, BCRA.
 * No mock or randomly generated values are produced here.
 */

import { getYahooSession, invalidateYahooSession } from "./yahoo-http";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type MonthlyPoint = { fecha: string; close: number };

export type Quote = {
  symbol: string;
  price: number;
  prevClose: number;
  varDia: number;
  ytd: number;
  currency: string;
  monthly: MonthlyPoint[];
  ok: boolean;
};

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        ...headers,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthLabel(ts: number) {
  const d = new Date(ts * 1000);
  return `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: { currency?: string; regularMarketPrice?: number; chartPreviousClose?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
};

/** Caché de quotes con stale-serving: ante 429/error se devuelve el último valor conocido. */
const quoteCache = new Map<string, { quote: Quote; exp: number }>();
const QUOTE_TTL = 300_000;

/** Último estado HTTP visto en Yahoo (para mostrar la causa en UI, no solo en logs). */
export let lastYahooStatus: number | null = null;
export let lastYahooAt: number | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Throttle global Yahoo: serializa las llamadas chart con un gap mínimo
// para no disparar el 429 con ráfagas paralelas (Promise.all de 3-6 symbols).
let yahooQueue: Promise<void> = Promise.resolve();
let lastYahooReqAt = 0;
const YAHOO_MIN_GAP = 700;

function throttleYahoo(): Promise<void> {
  const run = yahooQueue.then(async () => {
    const wait = YAHOO_MIN_GAP - (Date.now() - lastYahooReqAt);
    if (wait > 0) await sleep(wait);
    lastYahooReqAt = Date.now();
  });
  // Encadenar sin romper la cola ante errores.
  yahooQueue = run.catch(() => {});
  return run;
}

async function fetchChart(
  symbol: string,
  session?: { cookie: string; crumb: string } | null,
): Promise<YahooChart | null> {
  const range = "range=2y&interval=1d";
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : "";
  const cookie = session?.cookie;
  // Pasada 1: inmediata en ambos hosts. Pasada 2 (solo si 429): con espera, esquiva el throttle por segundo.
  for (let pass = 0; pass < 2; pass++) {
    for (const host of hosts) {
      try {
        await throttleYahoo();
        const res = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${range}${crumbParam}`, {
          headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        });
        lastYahooStatus = res.status;
        lastYahooAt = Date.now();
        if (res.status === 429) continue;
        if (!res.ok) continue;
        const data = (await res.json()) as YahooChart;
        if (data?.chart?.result?.[0]) return data;
      } catch {
        continue;
      }
    }
    if (lastYahooStatus === 429 && pass === 0) await sleep(2500);
    else break;
  }
  return null;
}

export async function fetchQuote(symbol: string): Promise<Quote> {
  const empty: Quote = {
    symbol,
    price: 0,
    prevClose: 0,
    varDia: 0,
    ytd: 0,
    currency: "ARS",
    monthly: [],
    ok: false,
  };
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() < cached.exp) return cached.quote;
  // Sesión Yahoo (cookie+crumb); si falla (429 con negative-cache), se intenta sin sesión
  let session: { cookie: string; crumb: string } | null = null;
  try {
    session = await getYahooSession();
  } catch {}
  const data = await fetchChart(symbol, session);
  const r = data?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  if (!r || ts.length === 0) {
    // Servir último valor conocido antes de devolver vacío (rate-limit 429).
    // Log degradado a warn con status para no inundar consola en dev.
    if (cached) return cached.quote;
    if (session) {
      // Reintentar una vez con sesión fresca y luego último conocido
      invalidateYahooSession();
    }
    if (lastYahooStatus === 429) {
      console.warn(`[fetchQuote] throttled 429 for ${symbol}, serving stale/empty`);
    } else {
      console.warn(`[fetchQuote] empty response for ${symbol} (status=${lastYahooStatus})`);
    }
    return empty;
  }

  const points: Array<{ ts: number; close: number }> = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    const t = ts[i];
    if (typeof c === "number" && Number.isFinite(c) && typeof t === "number") {
      points.push({ ts: t, close: c });
    }
  }
  if (points.length === 0) return empty;

  const last = points[points.length - 1]!;
  const prev = points[points.length - 2] ?? last;
  const price = r.meta?.regularMarketPrice ?? last.close;
  const prevClose = r.meta?.chartPreviousClose ?? prev.close;

  const year = new Date(last.ts * 1000).getUTCFullYear();
  const firstOfYear =
    points.find((p) => new Date(p.ts * 1000).getUTCFullYear() === year) ?? points[0]!;

  // last close of each of the last 13 months
  const byMonth = new Map<string, { ts: number; close: number }>();
  for (const p of points) {
    const d = new Date(p.ts * 1000);
    byMonth.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, p);
  }
  const monthly = [...byMonth.values()]
    .sort((a, b) => a.ts - b.ts)
    .slice(-13)
    .map((p) => ({ fecha: monthLabel(p.ts), close: p.close }));

  const out: Quote = {
    symbol,
    price,
    prevClose,
    varDia: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    ytd: firstOfYear.close ? ((price - firstOfYear.close) / firstOfYear.close) * 100 : 0,
    currency: r.meta?.currency ?? "ARS",
    monthly,
    ok: true,
  };
  quoteCache.set(symbol, { quote: out, exp: Date.now() + QUOTE_TTL });
  return out;
}

export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  // Secuencial (no Promise.all): con throttle global evita ráfagas que disparan 429.
  const out: Quote[] = [];
  for (const s of symbols) {
    out.push(await fetchQuote(s));
  }
  return out;
}

// ---------- Dólares ----------

export type DolarRow = {
  casa: string;
  label: string;
  value: number;
  changePct: number;
  fecha: string;
};

type DolarApiItem = { casa: string; nombre: string; venta: number; fechaActualizacion: string };
type HistItem = { casa: string; venta: number; fecha: string };

export async function fetchDolares(): Promise<DolarRow[]> {
  const [actual, hist] = await Promise.all([
    getJson<DolarApiItem[]>("https://dolarapi.com/v1/dolares"),
    getJson<HistItem[]>("https://api.argentinadatos.com/v1/cotizaciones/dolares"),
  ]);
  if (!actual) return [];

  const previos = new Map<string, number>();
  if (hist) {
    const porCasa = new Map<string, HistItem[]>();
    for (const h of hist) {
      const arr = porCasa.get(h.casa) ?? [];
      arr.push(h);
      porCasa.set(h.casa, arr);
    }
    for (const [casa, arr] of porCasa) {
      arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
      const prev = arr[arr.length - 2];
      if (prev) previos.set(casa, prev.venta);
    }
  }

  return actual.map((d) => {
    const prev = previos.get(d.casa);
    return {
      casa: d.casa,
      label: d.nombre,
      value: d.venta,
      changePct: prev ? ((d.venta - prev) / prev) * 100 : 0,
      fecha: d.fechaActualizacion,
    };
  });
}

export async function fetchMepSerie(): Promise<MonthlyPoint[]> {
  const hist = await getJson<HistItem[]>("https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa");
  if (!hist) return [];
  const byMonth = new Map<string, { fecha: string; close: number }>();
  for (const h of hist) {
    const d = new Date(`${h.fecha}T00:00:00Z`);
    byMonth.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, {
      fecha: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      close: h.venta,
    });
  }
  return [...byMonth.values()].slice(-13);
}

// ---------- Macro ----------

export type MacroItem = { label: string; value: string; detail: string };

type ValorFecha = { valor: number; fecha: string };
type BcraResponse = { results?: Array<{ detalle?: Array<{ fecha: string; valor: number }> }> };

async function bcraUltimo(id: number): Promise<ValorFecha | null> {
  const data = await getJson<BcraResponse>(
    `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${id}?limit=1`,
  );
  const d = data?.results?.[0]?.detalle?.[0];
  return d ? { valor: d.valor, fecha: d.fecha } : null;
}

const nf = (v: number, d = 1) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export async function fetchMacro(): Promise<{ items: MacroItem[]; riesgoPais: ValorFecha | null }> {
  const [inflacion, interanual, riesgo, reservas, badlar] = await Promise.all([
    getJson<ValorFecha[]>("https://api.argentinadatos.com/v1/finanzas/indices/inflacion"),
    getJson<ValorFecha[]>("https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual"),
    getJson<ValorFecha>("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo"),
    bcraUltimo(1),
    bcraUltimo(7),
  ]);

  const ultimo = (arr: ValorFecha[] | null) => (arr && arr.length ? arr[arr.length - 1]! : null);
  const infl = ultimo(inflacion);
  const infliA = ultimo(interanual);

  const items: MacroItem[] = [];
  if (infl) items.push({ label: "Inflación mensual", value: `${nf(infl.valor)}%`, detail: `INDEC · ${infl.fecha}` });
  if (infliA)
    items.push({ label: "Inflación interanual", value: `${nf(infliA.valor)}%`, detail: `INDEC · ${infliA.fecha}` });
  if (badlar)
    items.push({ label: "Tasa BADLAR privados", value: `${nf(badlar.valor)}%`, detail: `BCRA · TNA · ${badlar.fecha}` });
  if (reservas)
    items.push({
      label: "Reservas BCRA",
      value: `US$ ${nf(reservas.valor, 0)} M`,
      detail: `BCRA · brutas · ${reservas.fecha}`,
    });

  return { items, riesgoPais: riesgo ?? null };
}

// ---------- BCRA Cambiarias (USD oficial) ----------
export type BcraCambiariasCotizacion = { fecha: string; tipoPase: number; tipoCotizacion: number };

export async function fetchBcraCambiariasUsd(limit = 5): Promise<BcraCambiariasCotizacion[]> {
  const data = await getJson<{ results?: Array<{ detalle?: Array<{ fecha: string; tipoPase: number; tipoCotizacion: number }> }> }>(
    `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD?limit=${limit}`,
  );
  const detalle = data?.results?.[0]?.detalle ?? [];
  // fallback: si el endpoint agrupado falla, probar Cotizaciones con fecha
  if (detalle.length === 0) {
    const alt = await getJson<{ results?: { detalle?: Array<{ fecha: string; tipoPase: number; tipoCotizacion: number }> } }>(
      `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones?fecha=${new Date().toISOString().slice(0,10)}`,
    );
    const d2 = (alt?.results as any)?.detalle ?? [];
    if (Array.isArray(d2)) return d2.slice(0, limit).map((d: any) => ({ fecha: d.fecha, tipoPase: d.tipoPase, tipoCotizacion: d.tipoCotizacion }));
  }
  // La API devuelve agrupado por fecha, tomar último detalle por fecha
  // Si es array de fechas, aplanar
  if (Array.isArray((data as any)?.results)) {
    const flat: BcraCambiariasCotizacion[] = [];
    for (const r of (data as any).results ?? []) for (const d of r.detalle ?? []) flat.push({ fecha: r.fecha ?? d.fecha, tipoPase: d.tipoPase, tipoCotizacion: d.tipoCotizacion });
    if (flat.length) return flat.slice(-limit);
  }
  return detalle.map((d) => ({ fecha: (d as any).fecha ?? "", tipoPase: d.tipoPase, tipoCotizacion: d.tipoCotizacion }));
}

// ---------- Dataframe Resumen (indices + riesgo/reservas + USD) ----------
export type DataframeRow = { grupo: "indices" | "riesgo_reservas" | "usd"; label: string; symbol: string; valor: number; varDiaria: number; unidad: string; fecha?: string };

export async function fetchDataframe(): Promise<{ rows: DataframeRow[]; updatedAt: string }> {
  const [quotes, dolares, macro, bcraUsd] = await Promise.all([
    fetchQuotes(["^MERV", "SPY", "^IXIC"]),
    fetchDolares(),
    fetchMacro(),
    fetchBcraCambiariasUsd(2).catch(() => [] as BcraCambiariasCotizacion[]),
  ]);
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const rows: DataframeRow[] = [];
  // Indices: Merval ARS, SPY, Nasdaq
  const merval = bySymbol.get("^MERV");
  if (merval?.ok) rows.push({ grupo: "indices", label: "Merval", symbol: "^MERV", valor: merval.price, varDiaria: merval.varDia, unidad: "ARS" });
  const spy = bySymbol.get("SPY");
  if (spy?.ok) rows.push({ grupo: "indices", label: "SPY", symbol: "SPY", valor: spy.price, varDiaria: spy.varDia, unidad: "USD" });
  const nasdaq = bySymbol.get("^IXIC");
  if (nasdaq?.ok) rows.push({ grupo: "indices", label: "Nasdaq", symbol: "^IXIC", valor: nasdaq.price, varDiaria: nasdaq.varDia, unidad: "pts" });
  // Riesgo país y Reservas
  if (macro.riesgoPais) rows.push({ grupo: "riesgo_reservas", label: "Riesgo país", symbol: "EMBI-AR", valor: macro.riesgoPais.valor, varDiaria: 0, unidad: "bps", fecha: macro.riesgoPais.fecha });
  const reservas = macro.items.find((i) => i.label.toLowerCase().includes("reservas"));
  if (reservas) {
    const val = Number(reservas.value.replace(/[^0-9.-]/g, "").replace(",", ".")) || 0;
    rows.push({ grupo: "riesgo_reservas", label: "Reservas BCRA", symbol: "RESERVAS", valor: val, varDiaria: 0, unidad: "US$ M", fecha: reservas.detail.split("·").pop()?.trim() });
  }
  // USD: oficial (prefer BCRA cambiarias), MEP, CCL, Blue
  const oficialBcra = bcraUsd[bcraUsd.length - 1];
  if (oficialBcra) rows.push({ grupo: "usd", label: "Dólar oficial (BCRA Cambiarias)", symbol: "USD-BCRA", valor: oficialBcra.tipoCotizacion || oficialBcra.tipoPase, varDiaria: 0, unidad: "ARS", fecha: oficialBcra.fecha });
  for (const casa of ["oficial", "bolsa", "contadoconliqui", "blue"] as const) {
    const d = dolares.find((x) => x.casa === casa);
    if (d) rows.push({ grupo: "usd", label: d.label, symbol: d.casa.toUpperCase(), valor: d.value, varDiaria: d.changePct, unidad: "ARS", fecha: d.fecha });
  }
  return { rows, updatedAt: new Date().toISOString() };
}

// ---------- Perfiles de activo (sector / industria) ----------

export type AssetProfile = {
  symbol: string;
  sector: string;
  industria: string;
  tipo: string;
  moneda: string;
  mercado: string;
};

let creds: { cookie: string; crumb: string; exp: number } | null = null;

async function yahooCreds(): Promise<{ cookie: string; crumb: string } | null> {
  if (creds && Date.now() < creds.exp) return creds;
  try {
    const res = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } });
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    if (!cookie) return null;
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<")) return null;
    creds = { cookie, crumb, exp: Date.now() + 30 * 60_000 };
    return creds;
  } catch {
    return null;
  }
}

const profileCache = new Map<string, AssetProfile>();

type QuoteSummary = {
  quoteSummary?: {
    result?: Array<{
      assetProfile?: { sector?: string; industry?: string };
      price?: { quoteType?: string; currency?: string; exchangeName?: string };
    }>;
  };
};

export async function fetchProfiles(symbols: string[]): Promise<AssetProfile[]> {
  const unicos = [...new Set(symbols.filter(Boolean))].slice(0, 40);
  const cred = await yahooCreds();
  const out: AssetProfile[] = [];

  await Promise.all(
    unicos.map(async (symbol) => {
      const hit = profileCache.get(symbol);
      if (hit) {
        out.push(hit);
        return;
      }
      if (!cred) return;
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
        symbol,
      )}?modules=assetProfile,price&crumb=${encodeURIComponent(cred.crumb)}`;
      const data = await getJson<QuoteSummary>(url, { Cookie: cred.cookie });
      const r = data?.quoteSummary?.result?.[0];
      if (!r) return;
      const profile: AssetProfile = {
        symbol,
        sector: r.assetProfile?.sector ?? "",
        industria: r.assetProfile?.industry ?? "",
        tipo: r.price?.quoteType ?? "",
        moneda: r.price?.currency ?? "",
        mercado: r.price?.exchangeName ?? "",
      };
      profileCache.set(symbol, profile);
      out.push(profile);
    }),
  );

  return out;
}
