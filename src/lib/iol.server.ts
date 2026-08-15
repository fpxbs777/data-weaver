import { getCookies, setResponseHeader } from "@tanstack/react-start/server";

const TOKEN_URL = "https://api.invertironline.com/token";
const API = "https://api.invertironline.com";
const COOKIE = "iol_sess";

export type IolSession = {
  access: string;
  refresh: string;
  /** epoch ms */
  exp: number;
  user: string;
};

function encode(s: IolSession): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

function decode(raw: string): IolSession | null {
  try {
    const s = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as IolSession;
    if (!s?.access || !s?.refresh) return null;
    return s;
  } catch {
    return null;
  }
}

export function readSession(): IolSession | null {
  const raw = getCookies()[COOKIE];
  return raw ? decode(raw) : null;
}

export function writeSession(s: IolSession | null) {
  const base = `${COOKIE}=`;
  const attrs = "Path=/; HttpOnly; SameSite=Lax; Secure";
  setResponseHeader(
    "set-cookie",
    s
      ? `${base}${encode(s)}; ${attrs}; Max-Age=${60 * 60 * 24 * 14}`
      : `${base}; ${attrs}; Max-Age=0`,
  );
}

async function tokenRequest(body: Record<string, string>): Promise<IolSession> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      res.status === 400 || res.status === 401
        ? "Usuario o contraseña de InvertirOnline inválidos."
        : `IOL token error [${res.status}]: ${text.slice(0, 300)}`,
    );
  }
  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    ".expires"?: string;
    username?: string;
  };
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    exp: Date.now() + (json.expires_in ? json.expires_in * 1000 : 15 * 60 * 1000) - 30_000,
    user: json.username ?? body["username"] ?? "",
  };
}

export async function loginIol(username: string, password: string): Promise<IolSession> {
  const s = await tokenRequest({ username, password, grant_type: "password" });
  writeSession(s);
  return s;
}

export async function refreshIol(session: IolSession): Promise<IolSession> {
  const s = await tokenRequest({ refresh_token: session.refresh, grant_type: "refresh_token" });
  const next = { ...s, user: s.user || session.user };
  writeSession(next);
  return next;
}

async function currentSession(): Promise<IolSession> {
  const s = readSession();
  if (!s) throw new Error("SIN_SESION");
  if (Date.now() >= s.exp) return refreshIol(s);
  return s;
}

/** Llamada autenticada a la API de IOL con refresco automático de token. */
export async function iolFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  let session = await currentSession();

  const url = new URL(path.startsWith("http") ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const call = async (token: string) =>
    fetch(url.toString(), {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  let res = await call(session.access);
  if (res.status === 401) {
    session = await refreshIol(session);
    res = await call(session.access);
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) throw new Error("SIN_SESION");
    throw new Error(`IOL ${url.pathname} [${res.status}]: ${text.slice(0, 300)}`);
  }
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export type IolCliente = {
  id: number;
  numeroCliente?: string;
  nombre?: string;
  apellido?: string;
  totalCuentaValorizado?: number;
  [k: string]: unknown;
};

export async function listClientes(): Promise<IolCliente[]> {
  const raw = await iolFetch<unknown>("/api/v2/Asesores/Clientes");
  if (Array.isArray(raw)) return raw as IolCliente[];
  const obj = raw as { clientes?: IolCliente[]; items?: IolCliente[] } | null;
  return obj?.clientes ?? obj?.items ?? [];
}
