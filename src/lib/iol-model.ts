/**
 * Modelo normalizado de InvertirOnline (puro, sin I/O).
 * Convierte las respuestas crudas de la API en filas tipadas para la terminal.
 */

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type Moneda = "ARS" | "USD";

export type IolPos = {
  /** id estable: cuenta|simbolo|mercado */
  id: string;
  simbolo: string;
  descripcion: string;
  pais: string;
  mercado: string;
  tipo: string;
  moneda: Moneda;
  plazo: string;
  cantidad: number;
  comprometido: number;
  ppc: number;
  ultimoPrecio: number;
  variacionDiaria: number;
  puntosVariacion: number;
  gananciaPorcentaje: number;
  gananciaDinero: number;
  valorizado: number;
  parking: number;
  /** nombre de la cuenta: cartera propia o cliente */
  cuenta: string;
  clienteId: number | null;
  /** símbolo equivalente en Yahoo Finance para sector/industria */
  yahoo: string;
};

export type IolCuenta = {
  numero: string;
  tipo: string;
  moneda: Moneda;
  disponible: number;
  comprometido: number;
  saldo: number;
  titulosValorizados: number;
  total: number;
};

export type IolEstado = {
  cuentas: IolCuenta[];
  totalEnPesos: number;
};

export type ClienteIol = {
  id: number;
  nombre: string;
  numeroCuenta: string;
  tipoCuenta: string;
  esAsesor: boolean;
};

const obj = (v: Json | undefined): { [k: string]: Json } =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as { [k: string]: Json }) : {};

export const n = (v: Json | undefined): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const s = (v: Json | undefined): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const pick = (o: { [k: string]: Json }, keys: string[]): Json | undefined => {
  for (const k of Object.keys(o)) {
    if (keys.some((want) => want.toLowerCase() === k.toLowerCase())) return o[k];
  }
  return undefined;
};

export function monedaDe(raw: string): Moneda {
  return /dolar|dólar|usd|estadounidense/i.test(raw) ? "USD" : "ARS";
}

const TIPOS: Record<string, string> = {
  accionesargentinas: "Acciones",
  acciones: "Acciones",
  cedears: "CEDEAR",
  titulospublicos: "Bonos",
  obligacionesnegociables: "Obligaciones negociables",
  letras: "Letras",
  opciones: "Opciones",
  fondocomundeinversion: "FCI",
  fondosComunesDeInversion: "FCI",
  cauciones: "Cauciones",
};

export function labelTipo(raw: string): string {
  const key = raw.replace(/[\s_-]/g, "").toLowerCase();
  return TIPOS[key] ?? (raw ? raw.replace(/([a-z])([A-Z])/g, "$1 $2") : "Otros");
}

export function yahooSymbol(simbolo: string, mercado: string, pais: string): string {
  if (!simbolo) return "";
  if (/bcba/i.test(mercado) || /argentina/i.test(pais)) return `${simbolo}.BA`;
  return simbolo;
}

/** Normaliza `/api/v2/portafolio/...` o `/api/v2/Asesores/Portafolio/...`. */
export function normalizePortafolio(
  raw: Json,
  ctx: { cuenta: string; clienteId: number | null },
): IolPos[] {
  const root = obj(raw);
  const listRaw = Array.isArray(raw) ? raw : pick(root, ["activos", "items", "portafolio"]);
  const activos = Array.isArray(listRaw) ? listRaw : [];
  const paisRoot = s(pick(root, ["pais"]));

  return activos.map((a, i) => {
    const act = obj(a);
    const titulo = obj(pick(act, ["titulo"]));
    const simbolo = s(pick(titulo, ["simbolo"])) || s(pick(act, ["simbolo"]));
    const mercado = (s(pick(titulo, ["mercado"])) || s(pick(act, ["mercado"]))).toUpperCase();
    const pais = s(pick(titulo, ["pais"])) || paisRoot;
    const tipo = labelTipo(s(pick(titulo, ["tipo"])) || s(pick(act, ["tipo"])));
    const moneda = monedaDe(s(pick(titulo, ["moneda"])) || s(pick(act, ["moneda"])));
    const cantidad = n(pick(act, ["cantidad"]));
    const ultimoPrecio = n(pick(act, ["ultimoPrecio"]));
    const valorizado = n(pick(act, ["valorizado"])) || cantidad * ultimoPrecio;

    return {
      id: `${ctx.clienteId ?? "propia"}|${mercado}|${simbolo || i}`,
      simbolo,
      descripcion: s(pick(titulo, ["descripcion"])) || simbolo,
      pais,
      mercado: mercado || (/estados/i.test(pais) ? "NYSE" : "BCBA"),
      tipo,
      moneda,
      plazo: s(pick(titulo, ["plazo"])),
      cantidad,
      comprometido: n(pick(act, ["comprometido"])),
      ppc: n(pick(act, ["ppc"])),
      ultimoPrecio,
      variacionDiaria: n(pick(act, ["variacionDiaria"])),
      puntosVariacion: n(pick(act, ["puntosVariacion"])),
      gananciaPorcentaje: n(pick(act, ["gananciaPorcentaje"])),
      gananciaDinero: n(pick(act, ["gananciaDinero"])),
      valorizado,
      parking: n(obj(pick(act, ["parking"]))["disponibleInmediato"]),
      cuenta: ctx.cuenta,
      clienteId: ctx.clienteId,
      yahoo: yahooSymbol(simbolo, mercado, pais),
    };
  });
}

/** Normaliza `/api/v2/estadocuenta` y el equivalente de asesores. */
export function normalizeEstado(raw: Json): IolEstado {
  const root = obj(raw);
  const cuentasRaw = pick(root, ["cuentas"]);
  const cuentas: IolCuenta[] = (Array.isArray(cuentasRaw) ? cuentasRaw : []).map((c) => {
    const o = obj(c);
    return {
      numero: s(pick(o, ["numero"])),
      tipo: s(pick(o, ["tipo"])),
      moneda: monedaDe(s(pick(o, ["moneda"]))),
      disponible: n(pick(o, ["disponible"])),
      comprometido: n(pick(o, ["comprometido"])),
      saldo: n(pick(o, ["saldo"])),
      titulosValorizados: n(pick(o, ["titulosValorizados"])),
      total: n(pick(o, ["total"])),
    };
  });
  return { cuentas, totalEnPesos: n(pick(root, ["totalEnPesos", "total"])) };
}

/** Normaliza la lista de clientes del asesor (estructura variable). */
export function normalizeClientes(raw: Json): ClienteIol[] {
  const list = Array.isArray(raw) ? raw : (pick(obj(raw), ["clientes", "items"]) as Json[] | undefined) ?? [];
  return (Array.isArray(list) ? list : []).map((c, i) => {
    const o = obj(c);
    const id = n(pick(o, ["id", "idCliente", "numeroCliente", "numero", "idClienteAsesorado"]));
    const nombre =
      s(pick(o, ["apellidoYNombre", "nombreCompleto", "razonSocial", "nombre", "denominacion"])) ||
      `Cliente ${id || i + 1}`;
    return {
      id: id || i,
      nombre,
      numeroCuenta: s(pick(o, ["numeroCuenta", "cuentaComitente", "comitente"])),
      tipoCuenta: s(pick(o, ["tipoCuenta", "tipo"])),
      esAsesor: false,
    };
  });
}
