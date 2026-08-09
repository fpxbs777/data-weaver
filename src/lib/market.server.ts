/**
 * Real market data fetchers (server-only).
 * Sources: Yahoo Finance (chart API), DolarApi / ArgentinaDatos, BCRA.
 * No mock or randomly generated values are produced here.
 */

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
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
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
  const data = await getJson<YahooChart>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`,
  );
  const r = data?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  if (!r || ts.length === 0) return empty;

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

  return {
    symbol,
    price,
    prevClose,
    varDia: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    ytd: firstOfYear.close ? ((price - firstOfYear.close) / firstOfYear.close) * 100 : 0,
    currency: r.meta?.currency ?? "ARS",
    monthly,
    ok: true,
  };
}

export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  return Promise.all(symbols.map((s) => fetchQuote(s)));
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
