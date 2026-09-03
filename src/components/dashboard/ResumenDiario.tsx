import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { getResumenDiario } from "@/lib/resumen-diario.server";
import { useEtr } from "@/lib/etr-store";

type HoldingSort = "peso" | "var";

function fmtNum(v: number | null, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "— No disponible";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}
function fmtPct(v: number | null, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "— No disponible";
  return `${v > 0 ? "+" : ""}${fmtNum(v, d)}%`;
}
function fmtPrice(v: number | null, moneda: string): string {
  if (v == null || !Number.isFinite(v)) return "— No disponible";
  if (moneda === "ARS") return `$ ${fmtNum(v, 2)}`;
  if (moneda === "USD") return `US$ ${fmtNum(v, 2)}`;
  return fmtNum(v, 2);
}
function semaforo(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 0) return "text-[#22c55e]";
  if (v < 0) return "text-[#ef4444]";
  return "text-muted-foreground";
}

export function ResumenDiario() {
  const { holdings, varDiaCartera } = useEtr();
  const holdingsInput = useMemo(
    () =>
      holdings.map((h) => ({
        ticker: h.ticker,
        peso: holdings.length ? (h.cantidad * h.precio) / holdings.reduce((a, x) => a + x.cantidad * x.precio, 0) * 100 : 0,
        varDiaria: h.varDia ?? null,
        evento: (h as any).evento ?? null,
      })),
    [holdings],
  );

  const q = useQuery({
    queryKey: ["resumen-diario", holdingsInput.map((h) => `${h.ticker}:${h.peso.toFixed(2)}`).join("|")],
    queryFn: () => getResumenDiario({ data: { holdings: holdingsInput } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = q.data;
  const [contextOpen, setContextOpen] = useState(true);
  const [sort, setSort] = useState<HoldingSort>("peso");

  const holdingsOrdenados = useMemo(() => {
    if (!data?.holdings?.length && holdings.length) {
      // fallback a holdings del store si server no devolvió (cache)
      return [...holdings]
        .map((h) => ({
          ticker: h.ticker,
          precio: h.precio,
          peso: holdingsInput.find((x) => x.ticker === h.ticker)?.peso ?? 0,
          varDiaria: h.varDia,
          evento: (h as any).evento ?? null,
        }))
        .sort((a, b) => (sort === "peso" ? b.peso - a.peso : (b.varDiaria ?? -999) - (a.varDiaria ?? -999)));
    }
    return [];
  }, [data, holdings, holdingsInput, sort]);

  // Validación 100%
  const suma = data?.footer.suma ?? holdingsInput.reduce((a, h) => a + h.peso, 0);
  const sumaOk = data?.footer.sumaOk ?? Math.abs(suma - 100) < 0.01;

  if (q.isError) {
    return <div className="border border-[#C9A84C]/20 bg-[#080c12] p-4 text-sm text-muted-foreground">Error al cargar Resumen Diario. Reintentando…</div>;
  }

  return (
    <div className="bg-[#080c12] border border-[#C9A84C]/20" style={{ borderRadius: 0 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C9A84C]/20 bg-[#0f141e] px-4 py-3" style={{ borderRadius: 0 }}>
        <h2 className="font-mono text-sm font-semibold tracking-[0.14em] uppercase text-[#C9A84C]">Resumen Diario</h2>
        <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted-foreground">
          <span>Yahoo Finance {data?.timestamps.yahoo ?? "—"}</span>
          <span className="opacity-40">·</span>
          <span>BCRA {data?.timestamps.bcra ?? "—"}</span>
          <span className="opacity-40">·</span>
          <span>DolarApi {data?.timestamps.dolarApi ?? "—"}</span>
        </div>
      </div>

      {/* Fila 1 KPIs grandes */}
      <div className="grid grid-cols-1 gap-px bg-[#C9A84C]/20 sm:grid-cols-3">
        <div className="bg-[#080c12] px-4 py-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">Var. diaria cartera total</p>
          <p className={`mt-1 font-mono text-2xl font-semibold ${semaforo(varDiaCartera)}`}>{fmtPct(varDiaCartera)}</p>
          <p className="font-mono text-[11px] text-muted-foreground">Ponderado holdings</p>
        </div>
        <div className="bg-[#080c12] px-4 py-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">Riesgo país</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[#C9A84C]">{data?.macro.riesgoPais.valor != null ? `${fmtNum(data.macro.riesgoPais.valor, 0)} bps` : "— No disponible"}</p>
          <p className={`font-mono text-xs ${semaforo(data?.macro.riesgoPais.varDiaria ?? null)}`}>{fmtPct(data?.macro.riesgoPais.varDiaria ?? null)}</p>
        </div>
        <div className="bg-[#080c12] px-4 py-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">Dólar MEP</p>
          {(() => {
            const mep = data?.dolares.find((d) => d.casa === "mep");
            return (
              <>
                <p className="mt-1 font-mono text-2xl font-semibold text-[#C9A84C]">{mep?.venta != null ? `$ ${fmtNum(mep.venta, 2)}` : "— No disponible"}</p>
                <p className={`font-mono text-xs ${semaforo(mep?.varDiaria ?? null)}`}>{fmtPct(mep?.varDiaria ?? null)}</p>
              </>
            );
          })()}
        </div>
      </div>

      {/* Fila 2 cards */}
      <div className="grid gap-px bg-[#C9A84C]/20 sm:grid-cols-3">
        {/* Índices */}
        <div className="bg-[#0f141e] p-0">
          <div className="border-b border-[#C9A84C]/10 px-3 py-2">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#C9A84C]">Índices</p>
            <p className="font-mono text-[10px] text-muted-foreground">Merval · S&P 500 · Nasdaq</p>
          </div>
          <div className="divide-y divide-[#C9A84C]/10">
            {[
              { k: "merval", label: "Merval", d: data?.indices.merval },
              { k: "sp500", label: "S&P 500", d: data?.indices.sp500 },
              { k: "nasdaq", label: "Nasdaq", d: data?.indices.nasdaq },
            ].map(({ k, label, d }) => (
              <div key={k} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="font-mono text-xs text-white">{label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{d?.symbol ?? k} · {d?.moneda ?? ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs text-white">{d?.price != null ? fmtPrice(d.price, d.moneda ?? "ARS") : "— No disponible"}</p>
                  <p className={`font-mono text-xs ${semaforo(d?.varDiaria ?? null)}`}>{fmtPct(d?.varDiaria ?? null)}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">YTD {fmtPct(d?.ytd ?? null)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Dólares */}
        <div className="bg-[#0f141e] p-0">
          <div className="border-b border-[#C9A84C]/10 px-3 py-2">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#C9A84C]">Dólares</p>
            <p className="font-mono text-[10px] text-muted-foreground">Oficial → Cripto</p>
          </div>
          <div className="divide-y divide-[#C9A84C]/10">
            {(data?.dolares ?? []).map((d) => (
              <div key={d.casa} className="flex items-center justify-between px-3 py-2">
                <p className="font-mono text-xs text-white">{d.label}</p>
                <div className="text-right">
                  <p className="font-mono text-xs text-white">{d.venta != null ? `$ ${fmtNum(d.venta, 2)}` : "— No disponible"}</p>
                  <p className={`font-mono text-xs ${semaforo(d.varDiaria)}`}>{fmtPct(d.varDiaria)}</p>
                </div>
              </div>
            ))}
            {!data?.dolares?.length && <p className="px-3 py-4 text-center font-mono text-xs text-muted-foreground">— No disponible</p>}
          </div>
        </div>
        {/* Reservas */}
        <div className="bg-[#0f141e] p-0">
          <div className="border-b border-[#C9A84C]/10 px-3 py-2">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#C9A84C]">Reservas BCRA</p>
            <p className="font-mono text-[10px] text-muted-foreground">Millones USD · BCRA</p>
          </div>
          <div className="px-3 py-4">
            <p className="font-mono text-lg font-semibold text-white">{data?.macro.reservas.valor != null ? `US$ ${fmtNum(data.macro.reservas.valor, 0)} M` : "— No disponible"}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{data?.macro.reservas.fecha ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Contexto histórico colapsable */}
      <div className="border-t border-[#C9A84C]/20 bg-[#080c12]">
        <button onClick={() => setContextOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left" style={{ borderRadius: 0 }}>
          <span className="font-mono text-xs tracking-[0.14em] uppercase text-[#C9A84C]">Contexto histórico</span>
          <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">TC promedio e inflación lado a lado {contextOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
        </button>
        {contextOpen && (
          <div className="overflow-x-auto border-t border-[#C9A84C]/10">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-[#C9A84C]/20 bg-[#0f141e] text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                  <th className="px-3 py-2">Año</th>
                  <th className="px-3 py-2 text-right">TC promedio</th>
                  <th className="px-3 py-2 text-right">Inflación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C9A84C]/10">
                {(data?.contexto ?? []).map((r) => (
                  <tr key={r.anio} className="hover:bg-[#C9A84C]/5">
                    <td className="px-3 py-2 text-white">{r.anio}</td>
                    <td className="px-3 py-2 text-right text-white">{r.tcLabel}</td>
                    <td className="px-3 py-2 text-right text-white">{r.inflLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rendimiento cartera */}
      <div className="border-t border-[#C9A84C]/20 bg-[#0f141e] px-4 py-4">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-xs tracking-[0.14em] uppercase text-[#C9A84C]">Rendimiento cartera</h3>
          <span className="font-mono text-xs text-muted-foreground">2019 → 2026</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {(data?.rendimiento.anual ?? []).map((r) => (
            <div key={r.anio} className="min-w-16 flex-1 border border-[#C9A84C]/20 bg-[#080c12] px-2 py-2 text-center" style={{ borderRadius: 0 }}>
              <p className="font-mono text-[11px] text-muted-foreground">{r.anio}</p>
              <p className={`font-mono text-xs ${semaforo(r.ytd)}`}>{fmtPct(r.ytd)}</p>
              {r.badge && <span className="mt-1 inline-block bg-[#C9A84C] px-1 py-0.5 font-mono text-[10px] text-[#080c12]">{r.badge}</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 border border-[#C9A84C] bg-[#C9A84C]/10 px-3 py-2 text-center" style={{ borderRadius: 0 }}>
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#C9A84C]">Acumulado total</p>
          <p className="font-mono text-lg font-semibold text-white">{data?.rendimiento.acumuladoLabel ?? "— No disponible"}</p>
        </div>
      </div>

      {/* Holdings */}
      <div className="border-t border-[#C9A84C]/20 bg-[#080c12]">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-mono text-xs tracking-[0.14em] uppercase text-[#C9A84C]">Holdings</h3>
          <div className="flex gap-1">
            <button onClick={() => setSort("peso")} className={`border px-2 py-1 font-mono text-[11px] uppercase ${sort === "peso" ? "border-[#C9A84C] bg-[#C9A84C] text-[#080c12]" : "border-[#C9A84C]/20 text-muted-foreground"}`} style={{ borderRadius: 0 }}>Peso %</button>
            <button onClick={() => setSort("var")} className={`border px-2 py-1 font-mono text-[11px] uppercase ${sort === "var" ? "border-[#C9A84C] bg-[#C9A84C] text-[#080c12]" : "border-[#C9A84C]/20 text-muted-foreground"}`} style={{ borderRadius: 0 }}>Var. diaria</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-y border-[#C9A84C]/20 bg-[#0f141e] text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Peso %</th>
                <th className="px-3 py-2 text-right">Var. diaria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C9A84C]/10">
              {holdingsOrdenados.length ? holdingsOrdenados.map((h) => (
                <tr key={h.ticker} className="hover:bg-[#C9A84C]/5">
                  <td className="px-3 py-2">
                    <span className="text-white">{h.ticker}</span>
                    {h.evento && <span className="ml-2 bg-[#C9A84C]/20 px-1 py-0.5 text-[10px] text-[#C9A84C]">{h.evento}</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-white">{fmtNum(h.precio, 2)}</td>
                  <td className="px-3 py-2 text-right text-white">{fmtNum(h.peso, 2)}%</td>
                  <td className={`px-3 py-2 text-right ${semaforo(h.varDiaria)}`}>{fmtPct(h.varDiaria)}</td>
                </tr>
              )) : <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sin holdings</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#C9A84C]/20 bg-[#0f141e] px-4 py-3 font-mono text-xs" style={{ borderRadius: 0 }}>
        <span className="text-muted-foreground">Caución <b className="text-white">{fmtNum(data?.footer.caucionPeso ?? 0, 2)}%</b></span>
        <span className="text-muted-foreground">Dólares líquidos <b className="text-white">{fmtNum(data?.footer.liquidosPeso ?? 0, 2)}%</b></span>
        <span className={`flex items-center gap-1 ${sumaOk ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
          {!sumaOk && <AlertTriangle className="h-3 w-3" />}
          Suma {fmtNum(suma, 2)}% {sumaOk ? "✓ 100%" : "⚠ no cierra 100%"}
        </span>
      </div>
      <div className="border-t border-[#C9A84C]/10 bg-[#080c12] px-4 py-2 text-center font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
        Cintia Boos, Agente Productora CNV N° 2192 — Uso interno · No es recomendación de inversión
      </div>
    </div>
  );
}
