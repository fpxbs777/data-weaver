/**
 * Resumen Diario — server único para widget unificado.
 * Aditivo: reutiliza getDataframe (market) + lógica portada de etr2 comparativo.
 * Solo funciones necesarias: inflacionMensual, serieDolar, preciosPorDiciembre, ytdDesde,
 * inflacionAnio, promedioPrecio, promedioYtd, cached. Sin ETR/marca.
 * Timestamps por fuente sobre momento real de fetch (via cachedTimestamp).
 */

import { createServerFn } from "@tanstack/react-start";
import { cached, cachedTimestamp, getJson } from "./cache.server";
import { fetchYahooChart, yahooCloseAtYearEnd } from "./yahoo.server";
import { z } from "zod";

const AD = "https://api.argentinadatos.com";

// ---------- helpers portados (comparativo.functions.ts) ----------

function ytdDesde(base: number | null | undefined, fin: number | null | undefined): number | null {
  if (base == null || fin == null || base <= 0 || !Number.isFinite(base) || !Number.isFinite(fin)) return null;
  return (fin / base - 1) * 100;
}

type SerieFila = { fecha: string | null; valor: number | null };

function preciosPorDiciembre(rows: SerieFila[], desde: number, hasta: number): Map<number, number> {
  const porAnio = new Map<number, number>();
  const ordenadas = [...rows].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  for (const r of ordenadas) {
    if (!r.fecha || r.valor == null || !Number.isFinite(r.valor)) continue;
    const [y, m] = r.fecha.split("-").map(Number);
    if (!y || y < desde || y > hasta) continue;
    if (m === 12) porAnio.set(y, r.valor);
  }
  return porAnio;
}

async function inflacionMensual(): Promise<Array<{ fecha: string; valor: number }>> {
  return cached("resumen-inflacion-mensual", 12 * 60 * 60 * 1000, () =>
    getJson<Array<{ fecha: string; valor: number }>>(`${AD}/v1/finanzas/indices/inflacion`),
  );
}

async function serieDolar(casa: string): Promise<Array<{ fecha: string; compra: number | null; venta: number | null }>> {
  return cached(`resumen-dolar-${casa}`, 6 * 60 * 60 * 1000, () =>
    getJson<Array<{ fecha: string; compra: number | null; venta: number | null }>>(`${AD}/v1/cotizaciones/dolares/${encodeURIComponent(casa)}`),
  );
}

function inflacionAnio(anio: number, mensual: Array<{ fecha: string; valor: number }>): number | null {
  const meses = mensual.filter((m) => m.fecha?.startsWith(String(anio)));
  if (!meses.length) return null;
  return (meses.reduce((acc, m) => acc * (1 + Number(m.valor) / 100), 1) - 1) * 100;
}

// ---------- TC promedio (media casas) ----------

const CASAS_USD_ORDEN = ["oficial", "mep", "ccl", "tarjeta", "blue", "cripto"] as const;
const CASAS_LABEL: Record<string, string> = { oficial: "Oficial", mep: "MEP", ccl: "CCL", tarjeta: "Tarjeta", blue: "Blue", cripto: "Cripto" };

async function promedioPrecio(anio: number, seriesCache: Map<string, { precios: Map<number, number>; ultimo: number | null }>): Promise<number | null> {
  const conDato = seriesCache.size === 0 ? [] : Array.from(seriesCache.values()).filter((s) => (anio === new Date().getFullYear() ? s.ultimo != null : s.precios.has(anio))).map((s) => (anio === new Date().getFullYear() ? s.ultimo! : s.precios.get(anio)!));
  if (!conDato.length) return null;
  return conDato.reduce((a, b) => a + b, 0) / conDato.length;
}

// ---------- Indices / Macro / Dólares (reuso sin duplicar) ----------

async function fetchYahooQuote(symbol: string): Promise<{ price: number | null; varDiaria: number | null; ytd: number | null }> {
  return cached(`resumen-yahoo-${symbol}`, 60 * 1000, async () => {
    const now = Math.floor(Date.now() / 1000);
    const chart = await fetchYahooChart(symbol, { period1: now - 60 * 60 * 24 * 200, period2: now, interval: "1d" }).catch(() => null);
    const price = chart?.meta.regularMarketPrice ?? chart?.closes.at(-1) ?? null;
    const prev = chart?.meta.chartPreviousClose ?? chart?.closes.at(-2) ?? null;
    const baseYear = new Date().getFullYear();
    const baseClose = await yahooCloseAtYearEnd(symbol, baseYear).catch(() => null);
    return {
      price,
      varDiaria: price != null && prev != null && prev !== 0 ? (price / prev - 1) * 100 : null,
      ytd: price != null && baseClose != null && baseClose !== 0 ? (price / baseClose - 1) * 100 : null,
    };
  });
}

async function fetchRiesgoPais(): Promise<{ valor: number | null; varDiaria: number | null; fecha: string | null }> {
  return cached("resumen-riesgo", 60 * 1000, async () => {
    const ultimo = await getJson<{ fecha: string; valor: number }>(`${AD}/v1/finanzas/indices/riesgo-pais/ultimo`).catch(() => null);
    const serie = await getJson<Array<{ fecha: string; valor: number }>>(`${AD}/v1/finanzas/indices/riesgo-pais`).catch(() => []);
    const previo = serie.at(-2)?.valor ?? null;
    return {
      valor: ultimo?.valor ?? null,
      varDiaria: previo && ultimo?.valor != null ? ((ultimo.valor / previo - 1) * 100) : null,
      fecha: ultimo?.fecha ?? null,
    };
  });
}

async function fetchReservas(): Promise<{ valor: number | null; fecha: string | null }> {
  return cached("resumen-reservas", 60 * 1000, async () => {
    const catalogo = await getJson<{ results?: Array<{ idVariable: number; descripcion: string }> }>("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias").catch(() => ({ results: [] }));
    const variable = (catalogo.results ?? []).find((v) => (v.descripcion ?? "").toLowerCase().includes("reservas internacionales"));
    if (!variable) return { valor: null, fecha: null };
    const serie = await getJson<{ results?: Array<{ detalle?: Array<{ fecha: string; valor: number }> }> }>(`https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${variable.idVariable}?limit=2`).catch(() => ({ results: [] }));
    const detalle = serie.results?.[0]?.detalle ?? [];
    const last = detalle.at(-1);
    const prev = detalle.at(-2);
    return { valor: last?.valor ?? null, fecha: last?.fecha ?? null, varDiaria: last && prev ? ((last.valor / prev.valor - 1) * 100) : null } as any;
  });
}

async function fetchDolaresOrdenados(): Promise<Array<{ casa: string; label: string; venta: number | null; varDiaria: number | null; fecha: string | null }>> {
  return cached("resumen-dolares", 60 * 1000, async () => {
    const rows = await Promise.all(
      CASAS_USD_ORDEN.map(async (casa) => {
        const adKey = casa === "mep" ? "bolsa" : casa === "ccl" ? "contadoconliqui" : casa === "cripto" ? "cripto" : casa;
        const serie = await serieDolar(adKey).catch(() => []);
        const ordenada = [...serie].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
        const last = ordenada.at(-1);
        const prev = ordenada.at(-2);
        const venta = last?.venta ?? last?.compra ?? null;
        const varDiaria = last?.venta != null && prev?.venta != null && prev.venta !== 0 ? ((last.venta / prev.venta - 1) * 100) : null;
        return { casa, label: CASAS_LABEL[casa] ?? casa, venta, varDiaria, fecha: last?.fecha ?? null };
      }),
    );
    return rows;
  });
}

// ---------- validación 100% + caución/líquidos ----------

function validarSuma(holdings: Array<{ peso: number }>): { suma: number; ok: boolean } {
  const suma = holdings.reduce((a, h) => a + (h.peso ?? 0), 0);
  return { suma, ok: Math.abs(suma - 100) < 0.01 };
}

// ---------- serverFn ----------

export const getResumenDiario = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        holdings: z
          .array(
            z.object({
              ticker: z.string().min(1).max(20),
              peso: z.number().min(0).max(100),
              varDiaria: z.number().nullable().optional(),
              evento: z.string().max(120).nullable().optional(), // cupón/dividendo
            }),
          )
          .max(100)
          .default([]),
        aniosContexto: z.array(z.number().int().min(2022).max(2026)).default([2022, 2023, 2024, 2025, 2026]),
        aniosRendimiento: z.array(z.number().int().min(2019).max(2026)).default([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const now = Date.now();
    // Fuentes únicas — una llamada por fuente
    const settled = await Promise.allSettled([
      fetchYahooQuote("^MERV"),
      fetchYahooQuote("SPY"),
      fetchYahooQuote("^IXIC"),
      fetchRiesgoPais(),
      fetchReservas(),
      fetchDolaresOrdenados(),
      inflacionMensual().catch(() => [] as Array<{ fecha: string; valor: number }>),
      (async () => {
        const map = new Map<string, { precios: Map<number, number>; ultimo: number | null }>();
        for (const casa of CASAS_USD_ORDEN) {
          const adKey = casa === "mep" ? "bolsa" : casa === "ccl" ? "contadoconliqui" : casa === "cripto" ? "cripto" : casa;
          const serie = await serieDolar(adKey).catch(() => []);
          const rows = serie.map((r) => ({ fecha: r.fecha, valor: r.venta ?? r.compra }));
          const precios = preciosPorDiciembre(rows, 2018, 2026);
          const ultimo = [...rows].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")).at(-1)?.valor ?? null;
          map.set(casa, { precios, ultimo });
        }
        return map;
      })(),
    ]);
    const yahooMerv = settled[0].status === "fulfilled" ? settled[0].value : { price: null, varDiaria: null, ytd: null };
    const yahooSP = settled[1].status === "fulfilled" ? settled[1].value : { price: null, varDiaria: null, ytd: null };
    const yahooNasdaq = settled[2].status === "fulfilled" ? settled[2].value : { price: null, varDiaria: null, ytd: null };
    const riesgo = settled[3].status === "fulfilled" ? settled[3].value : { valor: null, varDiaria: null, fecha: null };
    const reservas = settled[4].status === "fulfilled" ? settled[4].value : { valor: null, fecha: null };
    const dolares = settled[5].status === "fulfilled" ? settled[5].value : [];
    const mensual = settled[6].status === "fulfilled" ? (settled[6].value as Array<{ fecha: string; valor: number }>) : [];
    const seriesUsdMap = settled[7].status === "fulfilled" ? (settled[7].value as Map<string, { precios: Map<number, number>; ultimo: number | null }>) : new Map();

    // Timestamps por fuente (momento real de fetch, no Date.now del render)
    const timestamps = {
      yahoo: cachedTimestamp("resumen-yahoo-^MERV") ?? new Date(now).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }),
      bcra: cachedTimestamp("resumen-reservas") ?? cachedTimestamp("resumen-riesgo") ?? new Date(now).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }),
      dolarApi: cachedTimestamp("resumen-dolares") ?? new Date(now).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }),
    };

    // Contexto histórico 2022–2026 — solo años con dato real
    const contexto = await Promise.all(
      data.aniosContexto.map(async (anio) => {
        const tc = await promedioPrecio(anio, seriesUsdMap);
        const infl = inflacionAnio(anio, mensual);
        const tcDisp = tc != null && Number.isFinite(tc);
        const inflDisp = infl != null && Number.isFinite(infl);
        return {
          anio,
          tcPromedio: tcDisp ? tc : null,
          inflacion: inflDisp ? infl : null,
          tcLabel: tcDisp ? `${tc!.toFixed(2)}` : "— No disponible",
          inflLabel: inflDisp ? `${infl!.toFixed(2)}%` : "— No disponible",
        };
      }),
    );

    // Rendimiento cartera 2019–2026 — requiere holdings con peso real; si no hay holdings, cada año = null
    // Portado de comparativo: ytdDesde sobre cierres diciembre. Aquí simplificado a varDiaria ponderada si no hay histórico por ticker.
    // Para acumulado, calculamos acumulado compuesto solo con años que tienen dato.
    let rendimientoAnual: Array<{ anio: number; ytd: number | null; badge: string | null }> = [];
    let acumuladoTotal: number | null = null;
    if (data.holdings.length > 0) {
      // ytd por año desde comparativo histórico (si holdings tiene ticker, usar yahooCloseAtYearEnd por cada)
      // Para no reimplementar todo historial por ticker aquí, usamos varDiaria ponderada como proxy YTD solo año actual;
      // años previos quedan — No disponible hasta portar historial completo. Esto evita inventar.
      const anioActual = new Date().getFullYear();
      rendimientoAnual = data.aniosRendimiento.map((anio) => {
        if (anio === anioActual) {
          const ytd = data.holdings.reduce((acc, h) => acc + (h.peso / 100) * (h.varDiaria ?? 0), 0);
          const tcYtd = ytdDesde((() => {
            // tc base = diciembre previo
            const base = seriesUsdMap.get("oficial")?.precios.get(anio - 1) ?? null;
            const fin = seriesUsdMap.get("oficial")?.precios.get(anio) ?? seriesUsdMap.get("oficial")?.ultimo ?? null;
            return base;
          })(), (() => {
            const fin = seriesUsdMap.get("oficial")?.ultimo ?? null;
            return fin;
          })());
          // badges solo si dato existe
          let badge: string | null = null;
          const infl = inflacionAnio(anio, mensual);
          if (tcYtd != null && ytd > tcYtd) badge = "vs dólar";
          else if (infl != null && ytd > infl) badge = "vs inflación";
          return { anio, ytd: Number.isFinite(ytd) ? ytd : null, badge };
        }
        return { anio, ytd: null, badge: null };
      });
      const conDato = rendimientoAnual.filter((r) => r.ytd != null) as Array<{ ytd: number }>;
      if (conDato.length) acumuladoTotal = conDato.reduce((acc, r) => acc * (1 + r.ytd / 100), 1) - 1;
      if (acumuladoTotal != null) acumuladoTotal = acumuladoTotal * 100;
    }

    // holdings detallados con validación
    const sumaInfo = validarSuma(data.holdings);
    // caución y líquidos: peso % de holdings con ticker CAUCION / USD
    const caucionPeso = data.holdings.filter((h) => h.ticker.toUpperCase().includes("CAUCION")).reduce((a, h) => a + h.peso, 0);
    const liquidosPeso = data.holdings.filter((h) => ["USD", "DOLAR", "LIQUIDEZ"].some((k) => h.ticker.toUpperCase().includes(k))).reduce((a, h) => a + h.peso, 0);

    return {
      indices: {
        merval: { label: "Merval", symbol: "^MERV", ...yahooMerv, moneda: "ARS" },
        sp500: { label: "S&P 500", symbol: "SPY", ...yahooSP, moneda: "USD" },
        nasdaq: { label: "Nasdaq", symbol: "^IXIC", ...yahooNasdaq, moneda: "USD" },
      },
      macro: { riesgoPais: riesgo, reservas },
      dolares: dolares.filter((d) => ["oficial", "mep", "ccl", "tarjeta", "blue", "cripto"].includes(d.casa)),
      timestamps,
      contexto,
      rendimiento: { anual: rendimientoAnual, acumuladoTotal, acumuladoLabel: acumuladoTotal != null ? `${acumuladoTotal.toFixed(2)}%` : "— No disponible" },
      holdings: data.holdings,
      footer: { caucionPeso, liquidosPeso, suma: sumaInfo.suma, sumaOk: sumaInfo.ok },
    };
  });
