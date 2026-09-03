/**
 * Cache en memoria con TTL y dedup de Promise.
 * Portado función por función desde etr2 — solo cached + getJson.
 * Sin Supabase, sin referencias a marca.
 */

type Entry<T> = { value: T; fetchedAt: number; expiresAt: number; promise?: Promise<T> };

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now && hit.value !== undefined) return hit.value;
  if (hit?.promise) return hit.promise;
  const promise = (async () => {
    const value = await loader();
    store.set(key, { value, fetchedAt: now, expiresAt: now + ttlMs });
    return value;
  })();
  store.set(key, { value: undefined as unknown as T, fetchedAt: now, expiresAt: now + ttlMs, promise } as Entry<T>);
  try {
    const v = await promise;
    return v;
  } finally {
    const e = store.get(key) as Entry<T> | undefined;
    if (e?.promise === promise) delete (e as any).promise;
  }
}

export function cachedTimestamp(key: string): string | null {
  const e = store.get(key);
  if (!e?.fetchedAt) return null;
  return new Date(e.fetchedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP_${res.status}_${url}`);
  return (await res.json()) as T;
}
