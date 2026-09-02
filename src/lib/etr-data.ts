/**
 * Tipos, cálculos puros y formateadores de ETR Terminal.
 * No contiene datos simulados: las cotizaciones llegan de APIs reales
 * (Yahoo Finance, DolarApi/ArgentinaDatos, BCRA) y las posiciones,
 * el modelo y los clientes los carga el asesor y quedan persistidos.
 */

export type Clase = "Renta variable" | "Renta fija" | "CEDEAR" | "Liquidez";
export const CLASES: Clase[] = ["Renta variable", "Renta fija", "CEDEAR", "Liquidez"];

export type Mercado = "BCBA" | "NYSE" | "NASDAQ" | "ROFEX";

/** Posición cargada por el asesor. `symbol` es el ticker de Yahoo Finance. */
export type Position = {
  ticker: string;
  name: string;
  clase: Clase;
  mercado: Mercado;
  symbol: string;
  cantidad: number;
  ppc: number;
  simbolo?: string;
  mercadosDisponibles?: Mercado[];
  sector?: string;
  industria?: string;
  tipoInstrumento?: "accion" | "cedear" | "on" | "titulo_publico" | "caucion" | "etf";
  moneda?: "ARS" | "USD";
  categoria?: string;
  subcategoria?: string;
  fuenteClasificacion?: "iol" | "diccionario" | "manual";
  overrideClasificacion?: boolean;
};

/** Columna custom del asesor (persistida) */
export type CustomColumn = {
  id: string;
  label: string;
  key: string;
};

/** Valores de mercado sobreescritos manualmente por el asesor. */
export type MarketOverride = { precio?: number; varDia?: number; ytd?: number };

/** Posición + datos de mercado resueltos (reales u override del asesor). */
export type Holding = Position & {
  precio: number;
  varDia: number;
  ytd: number;
  fuente: "real" | "manual" | "sin dato";
};

export type ModelRow = { ticker: string; clase: Clase; target: number };

export type Perfil = "Conservador" | "Moderado" | "Agresivo";

export type Client = {
  id: string;
  nombre: string;
  perfil: Perfil;
  patrimonio: number;
  varDia: number;
  ytd: number;
  drift: number;
  ultimaOperacion: string;
};

export type Alerta = {
  id: string;
  nivel: "critico" | "atencion" | "info";
  titulo: string;
  detalle: string;
  hora: string;
};

// ---- cálculos ----

export const valuado = (h: Holding) => h.cantidad * h.precio;
export const resultado = (h: Holding) => h.cantidad * (h.precio - h.ppc);

export const sumValuado = (hs: Holding[]) => hs.reduce((a, h) => a + valuado(h), 0);
export const sumResultado = (hs: Holding[]) => hs.reduce((a, h) => a + resultado(h), 0);

export const ponderado = (hs: Holding[], key: "varDia" | "ytd") => {
  const total = sumValuado(hs);
  if (!total) return 0;
  return hs.reduce((a, h) => a + valuado(h) * h[key], 0) / total;
};

export const pesoDe = (h: Holding, total: number) => (total ? (valuado(h) / total) * 100 : 0);

// ---- formatters ----

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export const fmtARS = (v: number) => ars.format(Number.isFinite(v) ? v : 0);
export const fmtNum = (v: number, d = 2) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(
    Number.isFinite(v) ? v : 0,
  );
export const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${num.format(Number.isFinite(v) ? v : 0)}%`;
export const fmtCompact = (v: number) =>
  new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
export const toneOf = (v: number): "gain" | "loss" | "flat" => (v > 0 ? "gain" : v < 0 ? "loss" : "flat");

/** Convierte texto escrito por el asesor ("1.234,5" / "12,3%") a número. */
export const parseNumber = (raw: string): number | null => {
  const clean = raw.replace(/[%\s$]/g, "").replace(/\./g, "").replace(",", ".");
  if (clean === "" || clean === "-") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};
