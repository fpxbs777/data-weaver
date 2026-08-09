/**
 * Demo dataset for the ETR Terminal UI.
 * Single source of truth so every view shares the same hierarchy:
 * cartera propia -> modelo -> clientes.
 */

export type Holding = {
  ticker: string;
  name: string;
  clase: "Renta variable" | "Renta fija" | "CEDEAR" | "Liquidez";
  mercado: "BCBA" | "NYSE" | "NASDAQ";
  cantidad: number;
  precio: number;
  ppc: number;
  varDia: number;
  ytd: number;
};

export const holdings: Holding[] = [
  { ticker: "GGAL", name: "Grupo Galicia", clase: "Renta variable", mercado: "BCBA", cantidad: 1800, precio: 6420, ppc: 5210, varDia: 2.14, ytd: 38.4 },
  { ticker: "YPFD", name: "YPF S.A.", clase: "Renta variable", mercado: "BCBA", cantidad: 320, precio: 43850, ppc: 39120, varDia: -1.08, ytd: 21.7 },
  { ticker: "PAMP", name: "Pampa Energía", clase: "Renta variable", mercado: "BCBA", cantidad: 950, precio: 3985, ppc: 3110, varDia: 0.86, ytd: 29.9 },
  { ticker: "AL30", name: "Bonar 2030 USD", clase: "Renta fija", mercado: "BCBA", cantidad: 42000, precio: 78.4, ppc: 66.1, varDia: 0.42, ytd: 18.6 },
  { ticker: "GD35", name: "Global 2035 USD", clase: "Renta fija", mercado: "BCBA", cantidad: 31000, precio: 71.2, ppc: 63.9, varDia: -0.31, ytd: 12.4 },
  { ticker: "AAPL", name: "Apple Inc.", clase: "CEDEAR", mercado: "NASDAQ", cantidad: 260, precio: 18420, ppc: 15980, varDia: 1.24, ytd: 16.1 },
  { ticker: "SPY", name: "S&P 500 ETF", clase: "CEDEAR", mercado: "NYSE", cantidad: 140, precio: 41250, ppc: 36740, varDia: 0.53, ytd: 14.8 },
  { ticker: "ARS", name: "Pesos disponibles", clase: "Liquidez", mercado: "BCBA", cantidad: 1, precio: 8420000, ppc: 8420000, varDia: 0, ytd: 0 },
];

export const valuado = (h: Holding) => h.cantidad * h.precio;
export const resultado = (h: Holding) => h.cantidad * (h.precio - h.ppc);

export const totalCartera = holdings.reduce((a, h) => a + valuado(h), 0);
export const totalResultado = holdings.reduce((a, h) => a + resultado(h), 0);
export const varDiaCartera =
  holdings.reduce((a, h) => a + valuado(h) * h.varDia, 0) / totalCartera;
export const ytdCartera =
  holdings.reduce((a, h) => a + valuado(h) * h.ytd, 0) / totalCartera;
export const liquidez =
  holdings.filter((h) => h.clase === "Liquidez").reduce((a, h) => a + valuado(h), 0);

export type MarketRow = {
  label: string;
  symbol: string;
  value: number;
  changePct: number;
  unit?: "ARS" | "USD" | "pts" | "bps";
};

export const indices: MarketRow[] = [
  { label: "Merval", symbol: "^MERV", value: 1842300, changePct: 1.42, unit: "pts" },
  { label: "S&P 500", symbol: "^GSPC", value: 5842.1, changePct: 0.38, unit: "pts" },
  { label: "Nasdaq", symbol: "^IXIC", value: 19241.7, changePct: -0.22, unit: "pts" },
  { label: "Riesgo país", symbol: "EMBI-AR", value: 682, changePct: -1.9, unit: "bps" },
];

export const divisas: MarketRow[] = [
  { label: "Dólar MEP", symbol: "MEP", value: 1284.5, changePct: 0.64, unit: "ARS" },
  { label: "Dólar CCL", symbol: "CCL", value: 1312.8, changePct: 0.71, unit: "ARS" },
  { label: "Dólar oficial", symbol: "OFI", value: 1048.0, changePct: 0.12, unit: "ARS" },
  { label: "Blue", symbol: "BLUE", value: 1270.0, changePct: -0.39, unit: "ARS" },
];

export const macro = [
  { label: "Inflación mensual", value: "2,4%", detail: "INDEC · último dato" },
  { label: "Inflación interanual", value: "118,9%", detail: "INDEC · i.a." },
  { label: "Tasa política monetaria", value: "35,0%", detail: "BCRA · TNA" },
  { label: "Reservas BCRA", value: "US$ 28.940 M", detail: "BCRA · brutas" },
];

export type ModelRow = { ticker: string; clase: Holding["clase"]; target: number };

export const modelo: ModelRow[] = [
  { ticker: "GGAL", clase: "Renta variable", target: 20 },
  { ticker: "YPFD", clase: "Renta variable", target: 22 },
  { ticker: "PAMP", clase: "Renta variable", target: 8 },
  { ticker: "AL30", clase: "Renta fija", target: 10 },
  { ticker: "GD35", clase: "Renta fija", target: 7 },
  { ticker: "AAPL", clase: "CEDEAR", target: 9 },
  { ticker: "SPY", clase: "CEDEAR", target: 11 },
  { ticker: "ARS", clase: "Liquidez", target: 13 },
];

export const pesoReal = (ticker: string) => {
  const h = holdings.find((x) => x.ticker === ticker);
  return h ? (valuado(h) / totalCartera) * 100 : 0;
};

export type Client = {
  id: string;
  nombre: string;
  perfil: "Conservador" | "Moderado" | "Agresivo";
  patrimonio: number;
  varDia: number;
  ytd: number;
  drift: number;
  ultimaOperacion: string;
};

export const clientes: Client[] = [
  { id: "C-1042", nombre: "Marta Ferreyra", perfil: "Conservador", patrimonio: 48200000, varDia: 0.42, ytd: 16.2, drift: 3.1, ultimaOperacion: "12 mar" },
  { id: "C-1088", nombre: "Ignacio Sosa", perfil: "Moderado", patrimonio: 91750000, varDia: 1.18, ytd: 24.9, drift: 7.8, ultimaOperacion: "18 mar" },
  { id: "C-1123", nombre: "Estudio Lemos SRL", perfil: "Agresivo", patrimonio: 214300000, varDia: -0.64, ytd: 31.4, drift: 12.6, ultimaOperacion: "21 mar" },
  { id: "C-1190", nombre: "Cecilia Bianchi", perfil: "Moderado", patrimonio: 33900000, varDia: 0.91, ytd: 19.7, drift: 2.2, ultimaOperacion: "07 mar" },
  { id: "C-1204", nombre: "Rubén Ojeda", perfil: "Conservador", patrimonio: 62400000, varDia: 0.08, ytd: 11.3, drift: 5.4, ultimaOperacion: "19 mar" },
];

export const totalAUM = clientes.reduce((a, c) => a + c.patrimonio, 0) + totalCartera;

export type SeriePoint = { fecha: string; cartera: number; merval: number; mep: number };

export const serieHistorica: SeriePoint[] = (() => {
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  let c = 100;
  let m = 100;
  let d = 100;
  const drift = [2.9, -1.4, 4.8, 3.1, -2.2, 5.6, 2.4, 3.9, -1.1, 4.4, 2.8, 3.6];
  return meses.map((mes, i) => {
    const d0 = drift[i] ?? 0;
    c *= 1 + d0 / 100;
    m *= 1 + (d0 * 0.82 + (i % 3 === 0 ? -0.9 : 0.4)) / 100;
    d *= 1 + (1.6 + (i % 4) * 0.35) / 100;
    return {
      fecha: mes,
      cartera: Number(c.toFixed(1)),
      merval: Number(m.toFixed(1)),
      mep: Number(d.toFixed(1)),
    };
  });
})();

export type Alerta = {
  id: string;
  nivel: "critico" | "atencion" | "info";
  titulo: string;
  detalle: string;
  hora: string;
};

export const alertas: Alerta[] = [
  { id: "a1", nivel: "critico", titulo: "Desvío > 10% en Estudio Lemos SRL", detalle: "Renta variable 12,6 p.p. por encima del modelo ETR.", hora: "10:42" },
  { id: "a2", nivel: "atencion", titulo: "Liquidez por encima del objetivo", detalle: "Cartera propia en 15,6% vs 13% objetivo del modelo ETR.", hora: "09:15" },
  { id: "a3", nivel: "info", titulo: "Nuevo dato de inflación INDEC", detalle: "2,4% mensual; actualizado en Macro & Tipo de cambio.", hora: "08:00" },
];

// ---- formatters ----
const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export const fmtARS = (v: number) => ars.format(v);
export const fmtNum = (v: number, d = 2) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
export const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${num.format(v)}%`;
export const fmtCompact = (v: number) =>
  new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
export const toneOf = (v: number): "gain" | "loss" | "flat" =>
  v > 0 ? "gain" : v < 0 ? "loss" : "flat";
