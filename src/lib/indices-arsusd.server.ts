/**
 * Indices ARS vs USD - server logic
 * Automatizado: dado ticker + mercado, resuelve cotización ARS (BCBA / .BA) y USD (NYSE/NASDAQ) o sintético via CCL.
 */
import { fetchQuote, fetchQuotes, lastYahooStatus, type Quote } from "./market.server";
import { getYahooSession, yahooHeaders } from "./yahoo-http";
import { iolFetch } from "./iol.server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getJson<T>(url: string, cookie?: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function yahooCookie(): Promise<string | undefined> {
  try {
    const s = await getYahooSession();
    return s?.cookie || undefined;
  } catch {
    return undefined;
  }
}

const searchMetaCache = new Map<string, { v: { descripcion: string; quoteType: string | null }; exp: number }>();

async function fetchYahooSearchMeta(symbol: string): Promise<{ descripcion: string; quoteType: string | null }> {
  const key = symbol.toUpperCase();
  const hit = searchMetaCache.get(key);
  if (hit && Date.now() < hit.exp) return hit.v;
  try {
    const cookie = await yahooCookie();
    const data = await getJson<{ quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; longName?: string; quoteType?: string }> }>(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=2&newsCount=0`,
      cookie,
    );
    const q = data?.quotes?.find((x) => x.symbol?.toUpperCase() === symbol.toUpperCase()) ?? data?.quotes?.[0];
    if (q) {
      const desc = q.longname || q.longName || q.shortname || symbol;
      const v = { descripcion: desc, quoteType: q.quoteType ?? null };
      searchMetaCache.set(key, { v, exp: Date.now() + 300_000 });
      return v;
    }
  } catch {}
  return { descripcion: symbol, quoteType: null };
}

// ---------- IOL descripciones (cedears / acciones / ETFs / títulos) ----------
type IolTitle = { simbolo: string; descripcion: string; tipo: string; mercado: string; ultimoPrecio: number; variacionDiaria: number };
let iolTitlesCache: { v: IolTitle[]; exp: number } | null = null;

async function loadIolTitles(): Promise<IolTitle[]> {
  if (iolTitlesCache && Date.now() < iolTitlesCache.exp) return iolTitlesCache.v;
  try {
    const [ar, us] = await Promise.all([
      iolFetch<{ activos?: Array<{ titulo?: { simbolo?: string; descripcion?: string; tipo?: string; mercado?: string }; ultimoPrecio?: number; variacionDiaria?: number }> }>("/api/v2/portafolio/Argentina").catch(() => null),
      iolFetch<{ activos?: Array<{ titulo?: { simbolo?: string; descripcion?: string; tipo?: string; mercado?: string }; ultimoPrecio?: number; variacionDiaria?: number }> }>("/api/v2/portafolio/Estados_Unidos").catch(() => null),
    ]);
    const out: IolTitle[] = [];
    for (const r of [ar, us]) {
      for (const a of r?.activos ?? []) {
        const t = a.titulo ?? {};
        if (!t.simbolo) continue;
        out.push({
          simbolo: String(t.simbolo).toUpperCase(),
          descripcion: String(t.descripcion ?? t.simbolo),
          tipo: String(t.tipo ?? ""),
          mercado: String(t.mercado ?? ""),
          ultimoPrecio: Number(a.ultimoPrecio ?? 0),
          variacionDiaria: Number(a.variacionDiaria ?? 0),
        });
      }
    }
    iolTitlesCache = { v: out, exp: Date.now() + 60_000 };
    return out;
  } catch {
    // SIN_SESION u otro error: degradar a Yahoo sin romper
    return [];
  }
}

/** Causa visible del fallo Yahoo (ej "Yahoo 429") para mostrar en UI, no solo en logs. */
function yahooCause(): string {
  return lastYahooStatus != null ? `Yahoo ${lastYahooStatus}` : "Yahoo sin respuesta";
}

// ---------- IOL cotizaciones por panel (precios sin Yahoo) ----------
export type IolQuote = { simbolo: string; descripcion: string; ultimoPrecio: number; variacion: number; moneda: string; mercado: string; pais: string };
let iolPanelCache: { v: IolQuote[]; exp: number } | null = null;

type IolPanelResp = { titulos?: Array<{ simbolo?: string; descripcion?: string; ultimoPrecio?: number; variacionPorcentual?: number; variacion?: number; moneda?: string; mercado?: string }> };

async function fetchIolPanel(instrumento: string, pais: string): Promise<IolQuote[]> {
  try {
    const r = await iolFetch<IolPanelResp>(`/api/v2/Cotizaciones/${instrumento}/${pais}/Todos`, {
      query: { "cotizacionInstrumentoModel.instrumento": instrumento, "cotizacionInstrumentoModel.pais": pais },
    });
    return (r?.titulos ?? [])
      .filter((t) => t?.simbolo)
      .map((t) => ({
        simbolo: String(t.simbolo).toUpperCase(),
        descripcion: String(t.descripcion ?? t.simbolo),
        ultimoPrecio: Number(t.ultimoPrecio ?? 0),
        variacion: Number(t.variacionPorcentual ?? t.variacion ?? 0),
        moneda: String(t.moneda ?? ""),
        mercado: String(t.mercado ?? ""),
        pais,
      }))
      .filter((t) => t.ultimoPrecio > 0);
  } catch {
    return [];
  }
}

async function loadIolPanelQuotes(): Promise<IolQuote[]> {
  if (iolPanelCache && Date.now() < iolPanelCache.exp) return iolPanelCache.v;
  const panels = await Promise.all([
    fetchIolPanel("acciones", "argentina"),
    fetchIolPanel("cedears", "argentina"),
    fetchIolPanel("titulosPublicos", "argentina"),
    fetchIolPanel("acciones", "Estados_Unidos"),
  ]);
  const v = panels.flat();
  iolPanelCache = { v, exp: Date.now() + 60_000 };
  return v;
}

export async function fetchIolQuote(simbolo: string, pais?: "argentina" | "Estados_Unidos"): Promise<IolQuote | null> {
  const key = simbolo.trim().toUpperCase().replace(/\.BA$/, "");
  if (!key) return null;
  const all = await loadIolPanelQuotes();
  const pool = pais ? all.filter((t) => t.pais.toLowerCase() === pais.toLowerCase()) : all;
  return pool.find((t) => t.simbolo === key) ?? pool.find((t) => t.simbolo.replace(/\.BA$/, "") === key) ?? null;
}

// ---------- IOL CotizacionDetalle (fallback directo por símbolo, incluye índices como MERV) ----------
// GET /api/v2/{mercado}/Titulos/{simbolo}/CotizacionDetalle — requiere sesión IOL.
// Devuelve { ultimoPrecio, variacionPorcentual/variacion }. Sin sesión → null (no rompe).
type IolDetalleResp = {
  ultimoPrecio?: number;
  variacionPorcentual?: number;
  variacion?: number;
  moneda?: string;
  descripcion?: string;
  simbolo?: string;
  mercado?: string;
};

const iolDetalleCache = new Map<string, { v: IolQuote | null; exp: number }>();

export async function fetchIolDetalle(simbolo: string, mercadoIol: string): Promise<IolQuote | null> {
  const key = `${mercadoIol.toUpperCase()}:${simbolo.toUpperCase()}`;
  const hit = iolDetalleCache.get(key);
  if (hit && Date.now() < hit.exp) return hit.v;
  try {
    const r = (await iolFetch<IolDetalleResp>(
      `/api/v2/${mercadoIol}/Titulos/${encodeURIComponent(simbolo)}/CotizacionDetalle`,
    )) as IolDetalleResp | null;
    const precio = Number(r?.ultimoPrecio ?? 0);
    if (!Number.isFinite(precio) || precio <= 0) {
      iolDetalleCache.set(key, { v: null, exp: Date.now() + 30_000 });
      return null;
    }
    const q: IolQuote = {
      simbolo: String(r?.simbolo ?? simbolo).toUpperCase(),
      descripcion: String(r?.descripcion ?? simbolo),
      ultimoPrecio: precio,
      variacion: Number(r?.variacionPorcentual ?? r?.variacion ?? 0),
      moneda: String(r?.moneda ?? ""),
      mercado: String(r?.mercado ?? mercadoIol),
      pais: mercadoIol.toLowerCase() === "bcba" ? "argentina" : "Estados_Unidos",
    };
    iolDetalleCache.set(key, { v: q, exp: Date.now() + 60_000 });
    return q;
  } catch {
    // SIN_SESION u otro error: cachear negativo corto para no reintentar en cada fila
    iolDetalleCache.set(key, { v: null, exp: Date.now() + 30_000 });
    return null;
  }
}

/** Precio IOL para un símbolo Yahoo: ^MERV→MERV/bCBA, SPY.BA→SPY/bCBA, SPY→SPY/NYSE, etc. */
export async function fetchIolIndiceQuote(yahooSymbol: string): Promise<IolQuote | null> {
  const s = yahooSymbol.trim().toUpperCase();
  if (!s) return null;
  // Índice Merval: IOL lo expone como MERV en bCBA
  if (s === "^MERV" || s === "MERV" || s === "MERVAL" || s === "^MERVAL") {
    const d = await fetchIolDetalle("MERV", "bCBA");
    if (d) return d;
    return fetchIolQuote("MERV", "argentina");
  }
  // Índices US: sin equivalente IOL directo → null (se usa stale-cache Yahoo)
  if (s.startsWith("^")) return null;
  const base = s.replace(/\.BA$/, "");
  if (s.endsWith(".BA")) {
    const d = await fetchIolDetalle(base, "bCBA");
    if (d) return d;
    return fetchIolQuote(base, "argentina");
  }
  // Símbolo US (SPY, QQQ…): probar NYSE, NASDAQ y panel
  for (const m of ["NYSE", "NASDAQ"]) {
    const d = await fetchIolDetalle(base, m);
    if (d) return d;
  }
  return fetchIolQuote(base, "Estados_Unidos");
}

export async function fetchIolMeta(simbolo: string): Promise<IolTitle | null> {
  const key = simbolo.trim().toUpperCase().replace(/\.BA$/, "");
  if (!key) return null;
  const titles = await loadIolTitles();
  return titles.find((t) => t.simbolo === key || t.simbolo === `${key}.BA` || t.simbolo.replace(/\.BA$/, "") === key) ?? null;
}

function mapQuoteTypeToTipo(quoteType: string | null, ticker: string, mercado: string): string {
  const t = ticker.toUpperCase();
  const qt = (quoteType ?? "").toUpperCase();
  if (qt === "INDEX" || t.startsWith("^")) return "Índice";
  if (qt === "ETF") return t.endsWith(".BA") ? "Cedear ETF" : "ETF";
  if (qt === "EQUITY") return t.endsWith(".BA") || mercado.toUpperCase() === "BCBA" ? "Cedear" : "Acción";
  if (qt === "MUTUALFUND") return "FCI";
  // fallback infer
  return inferTipo(t, mercado, null).tipo;
}

// ---------- CCL ----------
type CriptoYaCasa = { venta?: number; price?: number; ask?: number; compra?: number };
type CriptoYaResp = { ccl?: CriptoYaCasa; mep?: CriptoYaCasa; contadoconliqui?: CriptoYaCasa };
let cclCache: { value: number; exp: number } | null = null;

function pickPrice(o: unknown): number | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  for (const k of ["venta", "price", "ask"]) {
    const v = Number(r[k]);
    if (Number.isFinite(v) && v > 100) return v;
  }
  return null;
}

export async function fetchCcl(): Promise<number | null> {
  if (cclCache && Date.now() < cclCache.exp) return cclCache.value;
  try {
    const data = await getJson<CriptoYaResp>("https://criptoya.com/api/dolar");
    const ccl = pickPrice(data?.ccl) ?? pickPrice(data?.mep) ?? pickPrice(data?.contadoconliqui);
    if (ccl != null) {
      cclCache = { value: ccl, exp: Date.now() + 60_000 };
      return ccl;
    }
  } catch (e) {
    console.error("[fetchCcl] criptoya error:", e);
  }
  // fallback dolarapi contadoconliqui (returns object, not array)
  try {
    const fallback = await getJson<{ casa: string; venta: number }>("https://dolarapi.com/v1/dolares/contadoconliqui");
    if (fallback && typeof fallback === "object" && "venta" in fallback && Number.isFinite((fallback as any).venta) && (fallback as any).venta > 100) {
      const v = (fallback as any).venta as number;
      cclCache = { value: v, exp: Date.now() + 60_000 };
      return v;
    }
  } catch {}
  const all = await getJson<{ casa: string; venta: number }[]>("https://dolarapi.com/v1/dolares");
  const c = all?.find((x) => x.casa === "contadoconliqui" || x.casa === "ccl");
  if (c?.venta) {
    cclCache = { value: c.venta, exp: Date.now() + 60_000 };
    return c.venta;
  }
  return cclCache?.value ?? null;
}

export type IndiceArsUsdRow = {
  inputTicker: string;
  inputMercado: string;
  ars: { symbol: string; price: number | null; varDia: number | null; moneda: "ARS" | "USD" | string; ok: boolean; sintetico?: boolean };
  usd: { symbol: string; price: number | null; varDia: number | null; moneda: "USD" | string; ok: boolean; sintetico?: boolean };
  ccl: number | null;
  ok: boolean;
  error?: string;
  modo: "directo" | "sintetico_ccl" | "indice_ccl" | "fx";
  tipo: string;
  descripcion: string;
};

// indices conocidos: siempre ARS es el índice en pesos, USD es ARS / CCL
const INDICE_SET = new Set(["^MERV", "^GSPC", "^IXIC", "^DJI", "MERV", "MERVAL"]);
const ETF_SET = new Set(["SPY","QQQ","DIA","IWM","EWZ","EEM","XLF","XLE","XLV","XLK","XLI","XLP","XLE","XLRE","XLU","IWM","EFA","EEM","GLD","SLV","VTI","VOO","IVV","MTUM","QUAL","SIZE","USMV","IVE","IVW","EWW","ECH","VWO","FXI","INDA","EWG","EWJ","TIP","SHY","IEF","TLT","HYG","LQD","BNDX","USO","UNG","COPX","DBA","SOYB","CORN","LIT","ARGT","XLC","XLY"]);

function isIndice(ticker: string) {
  return ticker.startsWith("^") || INDICE_SET.has(ticker.toUpperCase());
}

function inferTipo(ticker: string, mercado: string, nombre?: string): { tipo: string; descripcion: string } {
  const t = ticker.trim().toUpperCase();
  const m = mercado.trim().toUpperCase();
  if (isIndice(t) || m === "INDEX" || m === "INDICE") {
    const desc = nombre || (t === "^MERV" ? "Índice Merval" : t.startsWith("^") ? `Índice ${t.replace("^","")}` : `Índice ${t}`);
    return { tipo: "Índice", descripcion: desc };
  }
  const base = t.replace(/\.BA$/,"");
  if (ETF_SET.has(base)) return { tipo: "ETF", descripcion: nombre || `ETF ${base}` };
  if (t.endsWith(".BA") || m === "BCBA") {
    // si es .BA con subyacente US -> Cedear
    if (ETF_SET.has(base)) return { tipo: "Cedear ETF", descripcion: nombre || `Cedear ${base}` };
    // check si base existe como US ticker en search index -> Cedear
    return { tipo: "Cedear", descripcion: nombre || `Cedear ${base}` };
  }
  if (["NYSE","NASDAQ","AMEX"].includes(m)) {
    return { tipo: ETF_SET.has(base) ? "ETF" : "Acción US", descripcion: nombre || base };
  }
  return { tipo: "Acción", descripcion: nombre || base };
}

/** Solo los tickers alfanuméricos simples admiten sufijo .BA (cedear). Índices (^), divisas (=X), guiones, etc. van tal cual. */
function canAppendBA(base: string): boolean {
  return /^[A-Z0-9]{1,12}$/.test(base);
}

function resolveSymbols(ticker: string, mercado: string): { arsSymbol: string; usdSymbol: string; modo: IndiceArsUsdRow["modo"] } {
  const t = ticker.trim().toUpperCase();
  const m = mercado.trim().toUpperCase();

  // Divisas / DXY: USD directo Yahoo, ARS sintético (USD×CCL)
  if (t.includes("=X") || t === "DX-Y.NYB" || t === "DXY") {
    return { arsSymbol: t, usdSymbol: t, modo: "fx" };
  }

  // Índice: modo indice_ccl
  if (isIndice(t) || m === "INDEX" || m === "INDICE") {
    // normalizar ^MERV
    let ars = t;
    if (t === "MERV" || t === "MERVAL") ars = "^MERV";
    if (!ars.startsWith("^") && INDICE_SET.has(ars)) ars = `^${ars}`;
    return { arsSymbol: ars, usdSymbol: ars, modo: "indice_ccl" };
  }

  const base = t.replace(/\.BA$/, "");
  const cedear = canAppendBA(base) ? `${base}.BA` : t;

  // Mercado BCBA: ARS es .BA, USD es subyacente sin sufijo
  if (m === "BCBA" || m === "BYMA" || m === "ARG" || m === "ARS") {
    const ars = t.endsWith(".BA") ? t : cedear;
    const usd = base; // subyacente
    return { arsSymbol: ars, usdSymbol: usd, modo: "directo" };
  }

  // Mercado US (NYSE/NASDAQ/AMEX): USD es ticker directo, ARS es cedear .BA
  if (["NYSE", "NASDAQ", "AMEX", "NASDAQGS", "NMS", "USD", "US"].includes(m)) {
    const usd = base;
    const ars = cedear;
    return { arsSymbol: ars, usdSymbol: usd, modo: "directo" };
  }

  // Fallback: si ticker termina .BA -> ARS .BA, USD base
  if (t.endsWith(".BA")) {
    return { arsSymbol: t, usdSymbol: base, modo: "directo" };
  }
  // default: intentar ambos, ARS .BA, USD base
  return { arsSymbol: cedear, usdSymbol: t, modo: "directo" };
}

// ---------- Caché de filas ARS/USD con stale-serving ante Yahoo 429 ----------
const indiceRowCache = new Map<string, { row: IndiceArsUsdRow; exp: number }>();
const INDICE_ROW_TTL = 300_000;

export async function fetchIndiceArsUsd(ticker: string, mercado: string): Promise<IndiceArsUsdRow> {
  const cleanTicker = ticker.trim();
  const cleanMercado = mercado.trim() || "BCBA";
  const cacheKey = `${cleanTicker.toUpperCase()}:${cleanMercado.toUpperCase()}`;
  // Servir caché fresca sin tocar Yahoo/IOL (evita 429 en refetch cada 120s)
  const fresh = indiceRowCache.get(cacheKey);
  if (fresh && Date.now() < fresh.exp && fresh.row.ok) return fresh.row;
  // buscar descripcion previa para inferir tipo (fallback)
  const idx = await loadSearchIndex();
  const found = idx.find((x) => x.ticker.toUpperCase() === cleanTicker.toUpperCase() || x.ticker.toUpperCase() === cleanTicker.toUpperCase().replace(/\.BA$/,"") || x.ticker.toUpperCase() === `${cleanTicker.toUpperCase()}.BA`);
  const nombreBase = found?.nombre;
  const inferredFallback = inferTipo(cleanTicker, cleanMercado, nombreBase);
  if (!cleanTicker) {
    return {
      inputTicker: ticker,
      inputMercado: mercado,
      ars: { symbol: "", price: null, varDia: null, moneda: "ARS", ok: false },
      usd: { symbol: "", price: null, varDia: null, moneda: "USD", ok: false },
      ccl: null,
      ok: false,
      error: "Ticker vacío",
      modo: "directo",
      tipo: inferredFallback.tipo,
      descripcion: inferredFallback.descripcion,
    };
  }
  const { arsSymbol, usdSymbol, modo } = resolveSymbols(cleanTicker, cleanMercado);
  const isIdx = modo === "indice_ccl";
  // Índices -> Yahoo; resto (cedears/acciones/ETFs/títulos) -> IOL primero, Yahoo respaldo
  const yahooMetaPromise = fetchYahooSearchMeta(cleanTicker.startsWith("^") ? cleanTicker : cleanTicker.replace(/\.BA$/,""));
  const iolMetaPromise = isIdx ? Promise.resolve(null) : fetchIolMeta(cleanTicker);

  if (modo === "indice_ccl") {
    const [q, ccl, yahooMeta, iolIdx] = await Promise.all([
      fetchQuote(arsSymbol),
      fetchCcl(),
      yahooMetaPromise,
      fetchIolIndiceQuote(arsSymbol),
    ]);
    const tipoReal = mapQuoteTypeToTipo(yahooMeta.quoteType, cleanTicker, cleanMercado);
    const descReal =
      (iolIdx?.descripcion && iolIdx.descripcion !== cleanTicker ? iolIdx.descripcion : null) ??
      (yahooMeta.descripcion !== cleanTicker ? yahooMeta.descripcion : inferredFallback.descripcion);
    // Yahoo OK → ese precio. Yahoo 429 pero IOL OK → precio IOL (índices también vía IOL).
    const px = q.ok ? q.price : iolIdx?.ultimoPrecio && iolIdx.ultimoPrecio > 0 ? iolIdx.ultimoPrecio : null;
    const pxVar = q.ok ? q.varDia : (iolIdx?.variacion ?? null);
    const pxMoneda = q.ok ? q.currency || "ARS" : "ARS";
    if (px == null) {
      // Sin Yahoo ni IOL → devolver stale-cache si existe, si no error visible
      const stale = indiceRowCache.get(`${cleanTicker.toUpperCase()}:${cleanMercado.toUpperCase()}`);
      if (stale && stale.row.ok) return stale.row;
      return {
        inputTicker: cleanTicker,
        inputMercado: cleanMercado,
        ars: { symbol: arsSymbol, price: null, varDia: null, moneda: "ARS", ok: false },
        usd: { symbol: arsSymbol, price: null, varDia: null, moneda: "USD", ok: false },
        ccl,
        ok: false,
        error: `Sin datos ${arsSymbol} (${yahooCause()}${ccl ? "" : ", sin CCL"}${iolIdx ? "" : ", sin IOL"})`,
        modo,
        tipo: tipoReal,
        descripcion: descReal,
      };
    }
    const usdPrice = ccl && ccl > 0 ? px / ccl : null;
    const row: IndiceArsUsdRow = {
      inputTicker: cleanTicker,
      inputMercado: cleanMercado,
      ars: { symbol: arsSymbol, price: px, varDia: pxVar, moneda: pxMoneda, ok: true, sintetico: !q.ok },
      usd: { symbol: arsSymbol, price: usdPrice, varDia: pxVar, moneda: "USD", ok: usdPrice != null, sintetico: true },
      ccl,
      ok: true,
      modo,
      tipo: tipoReal,
      descripcion: descReal,
    };
    indiceRowCache.set(`${cleanTicker.toUpperCase()}:${cleanMercado.toUpperCase()}`, { row, exp: Date.now() + INDICE_ROW_TTL });
    return row;
  }

  if (modo === "fx") {
    const [q, ccl, yahooMeta] = await Promise.all([fetchQuote(arsSymbol), fetchCcl(), yahooMetaPromise]);
    const descReal = yahooMeta.descripcion !== cleanTicker ? yahooMeta.descripcion : cleanTicker;
    if (!q.ok) {
      return {
        inputTicker: cleanTicker,
        inputMercado: cleanMercado,
        ars: { symbol: arsSymbol, price: null, varDia: null, moneda: "ARS", ok: false },
        usd: { symbol: usdSymbol, price: null, varDia: null, moneda: "USD", ok: false },
        ccl,
        ok: false,
        error: `Sin datos ${arsSymbol} (${yahooCause()}${ccl ? "" : ", sin CCL"})`,
        modo,
        tipo: "Moneda",
        descripcion: descReal,
      };
    }
    const arsPrice = ccl && ccl > 0 ? q.price * ccl : null;
    return {
      inputTicker: cleanTicker,
      inputMercado: cleanMercado,
      ars: { symbol: arsSymbol, price: arsPrice, varDia: q.varDia, moneda: "ARS", ok: arsPrice != null, sintetico: true },
      usd: { symbol: usdSymbol, price: q.price, varDia: q.varDia, moneda: q.currency || "USD", ok: true },
      ccl,
      ok: true,
      modo,
      tipo: "Moneda",
      descripcion: descReal,
    };
  }

  // modo directo: Yahoo + paneles IOL + CotizacionDetalle IOL (precios sin Yahoo si hay sesión) + meta IOL/yahoo
  const baseSym = cleanTicker.replace(/\.BA$/, "");
  const [quotes, ccl, yahooMeta, iolMeta, iolArs, iolUsd, iolDetArs, iolDetUsd] = await Promise.all([
    fetchQuotes([arsSymbol, usdSymbol]),
    fetchCcl(),
    yahooMetaPromise,
    iolMetaPromise,
    fetchIolQuote(baseSym, "argentina"),
    fetchIolQuote(baseSym, "Estados_Unidos"),
    fetchIolIndiceQuote(arsSymbol),
    fetchIolIndiceQuote(usdSymbol),
  ]);
  const qArs = quotes[0]!;
  const qUsd = quotes[1]!;
  const tipoReal = mapQuoteTypeToTipo(yahooMeta.quoteType, cleanTicker, cleanMercado);
  const yahooDesc = yahooMeta.descripcion !== cleanTicker.replace(/\.BA$/,"") ? yahooMeta.descripcion : inferredFallback.descripcion;
  const descReal = iolMeta?.descripcion || iolArs?.descripcion || iolDetArs?.descripcion || yahooDesc;

  const arsIol = iolArs ?? iolDetArs;
  const usdIol = iolUsd ?? iolDetUsd;
  // ARS: Yahoo > IOL panel/detalle > sintético(USD×CCL)
  let ars = qArs.ok
    ? { symbol: arsSymbol, price: qArs.price, varDia: qArs.varDia, moneda: qArs.currency || "ARS", ok: true, sintetico: false as const }
    : arsIol
      ? { symbol: arsSymbol, price: arsIol.ultimoPrecio, varDia: arsIol.variacion, moneda: "ARS", ok: true, sintetico: false as const }
      : { symbol: arsSymbol, price: null as number | null, varDia: null as number | null, moneda: "ARS", ok: false, sintetico: false as const };
  // USD: Yahoo > IOL panel EEUU/detalle > sintético(ARS/CCL)
  let usd = qUsd.ok
    ? { symbol: usdSymbol, price: qUsd.price, varDia: qUsd.varDia, moneda: qUsd.currency || "USD", ok: true, sintetico: false as const }
    : usdIol
      ? { symbol: usdSymbol, price: usdIol.ultimoPrecio, varDia: usdIol.variacion, moneda: "USD", ok: true, sintetico: false as const }
      : { symbol: usdSymbol, price: null as number | null, varDia: null as number | null, moneda: "USD", ok: false, sintetico: false as const };

  let outModo = modo;
  if (!ars.ok && usd.ok && ccl) {
    ars = { symbol: arsSymbol, price: usd.price! * ccl, varDia: usd.varDia, moneda: "ARS", ok: true, sintetico: true as const };
    outModo = "sintetico_ccl";
  } else if (!usd.ok && ars.ok && ccl) {
    usd = { symbol: usdSymbol, price: ars.price! / ccl, varDia: ars.varDia, moneda: "USD", ok: true, sintetico: true as const };
    outModo = "sintetico_ccl";
  }

  if (!ars.ok && !usd.ok) {
    // Stale-cache antes de devolver vacío (Yahoo 429 transitorio)
    const stale = indiceRowCache.get(cacheKey);
    if (stale && stale.row.ok) return stale.row;
  }
  const row: IndiceArsUsdRow = {
    inputTicker: cleanTicker,
    inputMercado: cleanMercado,
    ars,
    usd,
    ccl,
    ok: ars.ok || usd.ok,
    error: !ars.ok && !usd.ok ? `Sin datos ${arsSymbol} / ${usdSymbol} (${yahooCause()}${ccl ? "" : ", sin CCL"}${arsIol || usdIol ? "" : ", sin IOL"})` : undefined,
    modo: outModo,
    tipo: tipoReal,
    descripcion: descReal,
  };
  if (row.ok) indiceRowCache.set(cacheKey, { row, exp: Date.now() + INDICE_ROW_TTL });
  return row;
}

export async function fetchIndicesArsUsdBatch(items: { ticker: string; mercado: string }[]): Promise<IndiceArsUsdRow[]> {
  const uniq = items.slice(0, 30);
  // batch fetch CCL once
  const ccl = await fetchCcl();
  // Ejecutar en paralelo con límite 5
  const out: IndiceArsUsdRow[] = [];
  const batchSize = 5;
  for (let i = 0; i < uniq.length; i += batchSize) {
    const slice = uniq.slice(i, i + batchSize);
    const rows = await Promise.all(slice.map((it) => fetchIndiceArsUsd(it.ticker, it.mercado)));
    // sobrescribir ccl si ya lo tenemos (evitar múltiples fetches)
    for (const r of rows) if (!r.ccl && ccl) r.ccl = ccl;
    out.push(...rows);
  }
  return out;
}

// ---------- Search ----------
export type TickerSearchItem = { ticker: string; mercado: string; nombre: string };

let searchIndex: TickerSearchItem[] | null = null;

async function loadSearchIndex(): Promise<TickerSearchItem[]> {
  if (searchIndex) return searchIndex;
  try {
    const [base, factors] = await Promise.all([
      import("@/data/ticker_search_index.json"),
      import("@/data/factors_master.json").catch(() => ({ default: [] as TickerSearchItem[] })),
    ]);
    const arr = (base.default ?? base) as TickerSearchItem[];
    const fac = (factors.default ?? factors) as TickerSearchItem[];
    const seen = new Set(arr.map((x) => `${x.ticker}|${x.mercado}`));
    // Factores primero para que rankeen en el desplegable
    const merged = [...fac.filter((x) => !seen.has(`${x.ticker}|${x.mercado}`)), ...arr];
    searchIndex = merged;
    return merged;
  } catch {
    return [];
  }
}

export async function searchTickers(q: string, mercado?: string, limit = 8): Promise<TickerSearchItem[]> {
  const query = q.trim().toUpperCase();
  if (!query) return [];
  const idx = await loadSearchIndex();
  let filtered = idx.filter((it) => it.ticker.toUpperCase().includes(query) || it.nombre.toUpperCase().includes(query));
  if (mercado) {
    const m = mercado.toUpperCase();
    // priorizar mercado solicitado
    filtered = filtered.sort((a, b) => (a.mercado === m ? -1 : b.mercado === m ? 1 : 0));
  }
  return filtered.slice(0, limit);
}
