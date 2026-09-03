/**
 * Cliente HTTP Yahoo Finance con sesión (cookie + crumb).
 * Sin esto, query1/query2 devuelven 401/429 y las cotizaciones quedan en "—".
 * Patrón: seed https://fc.yahoo.com -> /v1/test/getcrumb -> requests con Cookie + crumb.
 */

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type YahooSession = { cookie: string; crumb: string; expiresAt: number };

let sessionCache: YahooSession | null = null;
let sessionPromise: Promise<YahooSession> | null = null;
// Negative cache: si Yahoo devuelve 429, no reintentar getcrumb por 60s
// para no amplificar el rate-limit con ráfagas paralelas.
let sessionFailUntil = 0;
let lastSessionErrorAt = 0;

function getSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  try {
    const arr = withGetSetCookie.getSetCookie?.();
    if (arr?.length) return arr;
  } catch {}
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function newSession(): Promise<YahooSession> {
  const now = Date.now();
  const seed = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": YAHOO_UA, Accept: "text/html" },
    redirect: "manual",
  });
  const cookie = getSetCookies(seed.headers)
    .map((v) => v.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YAHOO_UA, Accept: "text/plain", ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (crumbRes.status === 429) {
    // Backoff de 60s ante throttle: evita martillar getcrumb en cada quote.
    sessionFailUntil = now + 60_000;
    throw new Error(`Yahoo auth 429`);
  }
  if (!crumbRes.ok) throw new Error(`Yahoo auth ${crumbRes.status}`);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.startsWith("{") || crumb.length > 64) throw new Error("Yahoo auth invalid crumb");
  sessionFailUntil = 0;
  sessionCache = { cookie, crumb, expiresAt: now + 20 * 60 * 1000 };
  return sessionCache;
}

export async function getYahooSession(forceRefresh = false): Promise<YahooSession | null> {
  const now = Date.now();
  if (!forceRefresh && sessionCache && sessionCache.expiresAt > now) return sessionCache;
  if (!forceRefresh && now < sessionFailUntil) return sessionCache;
  if (!forceRefresh && sessionPromise) return sessionPromise.catch(() => sessionCache);
  sessionPromise = newSession();
  try {
    return await sessionPromise;
  } catch (e) {
    // Log con throttle (máx 1 cada 30s) para no inundar la consola en dev con 429.
    const t = Date.now();
    if (t - lastSessionErrorAt > 30_000) {
      lastSessionErrorAt = t;
      console.error("[yahoo] session error:", e instanceof Error ? e.message : e);
    }
    return sessionCache;
  } finally {
    sessionPromise = null;
  }
}

export function invalidateYahooSession() {
  sessionCache = null;
}

export function yahooHeaders(cookie?: string): Record<string, string> {
  return {
    "User-Agent": YAHOO_UA,
    Accept: "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

export async function fetchYahooQuoteSummaryJson<T>(
  symbol: string,
  modules: string[],
  forceSessionRefresh = false,
): Promise<{ status: number; json: T | null; errorText: string | null }> {
  const session = await getYahooSession(forceSessionRefresh);
  const params = new URLSearchParams({
    modules: modules.join(","),
    corsDomain: "finance.yahoo.com",
    formatted: "false",
    ...(session ? { crumb: session.crumb } : {}),
  });
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params}`;
  const res = await fetch(url, { headers: yahooHeaders(session?.cookie) });
  if (res.status === 401 && !forceSessionRefresh) {
    invalidateYahooSession();
    return fetchYahooQuoteSummaryJson<T>(symbol, modules, true);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { status: res.status, json: null, errorText: t.slice(0, 200) };
  }
  return { status: res.status, json: (await res.json()) as T, errorText: null };
}
