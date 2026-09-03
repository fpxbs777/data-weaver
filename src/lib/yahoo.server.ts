/**
 * Yahoo Finance helpers — portado función por función desde etr2.
 * Solo fetchYahooChart + cierres diciembre. Sin marca.
 */

const YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface YahooSession { cookie: string; crumb: string; expiresAt: number; }
let sessionCache: YahooSession | null = null;

function getSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = withGetSetCookie.getSetCookie?.();
  if (setCookies?.length) return setCookies;
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function getYahooSession(forceRefresh = false): Promise<YahooSession> {
  const now = Date.now();
  if (!forceRefresh && sessionCache && sessionCache.expiresAt > now) return sessionCache;
  const seed = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": YAHOO_UA, Accept: "text/html" }, redirect: "manual" });
  const cookie = getSetCookies(seed.headers).map((v) => v.split(";")[0]).filter(Boolean).join("; ");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": YAHOO_UA, Accept: "text/plain", ...(cookie ? { Cookie: cookie } : {}) } });
  if (!crumbRes.ok) throw new Error(`Yahoo auth ${crumbRes.status}`);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.startsWith("{")) throw new Error("Yahoo auth invalid crumb");
  sessionCache = { cookie, crumb, expiresAt: now + 20 * 60 * 1000 };
  return sessionCache;
}

export type YahooChart = { timestamps: number[]; closes: number[]; meta: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number; currency?: string } };

export async function fetchYahooChart(symbol: string, params: { period1: number; period2: number; interval: string }): Promise<YahooChart | null> {
  const session = await getYahooSession().catch(() => null);
  const query = new URLSearchParams({ period1: String(params.period1), period2: String(params.period2), interval: params.interval, includePrePost: "false", events: "div,splits" });
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json", ...(session?.cookie ? { Cookie: session.cookie } : {}) } });
  if (!res.ok) return null;
  const json = (await res.json()) as { chart?: { result?: Array<{ timestamp?: number[]; meta?: YahooChart["meta"]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const rawCloses = result.indicators?.quote?.[0]?.close ?? [];
  const timestamps: number[] = [];
  const closes: number[] = [];
  (result.timestamp ?? []).forEach((t, i) => {
    const c = rawCloses[i];
    if (typeof c === "number" && Number.isFinite(c)) { timestamps.push(t); closes.push(c); }
  });
  return { timestamps, closes, meta: result.meta ?? {} };
}

export async function yahooCloseAtYearEnd(symbol: string, year: number): Promise<number | null> {
  const period1 = Math.floor(Date.UTC(year, 11, 1) / 1000);
  const period2 = Math.floor(Date.UTC(year + 1, 0, 8) / 1000);
  const chart = await fetchYahooChart(symbol, { period1, period2, interval: "1d" });
  if (!chart || chart.closes.length === 0) return null;
  let last: number | null = null;
  chart.timestamps.forEach((t, i) => { const d = new Date(t * 1000); if (d.getUTCFullYear() === year && d.getUTCMonth() === 11) last = chart.closes[i] ?? last; });
  return last;
}
