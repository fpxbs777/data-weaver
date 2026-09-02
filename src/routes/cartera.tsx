import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, RefreshCw, Columns3, EyeOff } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta, Pill } from "@/components/etr/primitives";
import { Editable, commitNumber } from "@/components/etr/editable";
import { useEtr } from "@/lib/etr-store";
import { CLASES, fmtARS, fmtNum, pesoDe, resultado, valuado, sumValuado, type Clase, type Mercado } from "@/lib/etr-data";
import { useMemo, useState } from "react";

const MERCADOS: Mercado[] = ["BCBA", "NYSE", "NASDAQ", "ROFEX"];

export const Route = createFileRoute("/cartera")({
  head: () => ({
    meta: [
      { title: "Tenencias de cartera en vivo — ETR" },
      { name: "description", content: "Posiciones con precios reales de IOL/Yahoo, valuación, resultado y peso por activo. Tablas por moneda, mercado y tipo + sector/industria. Editable doble clic." },
      { property: "og:title", content: "Tenencias — ETR" },
    ],
  }),
  component: Cartera,
});

function Cartera() {
  const {
    holdings,
    holdingsIol,
    totalCartera,
    totalResultado,
    varDiaCartera,
    ytdCartera,
    updatePosition,
    updateOverride,
    clearOverride,
    addPosition,
    removePosition,
    addColumn,
    removeColumn,
    toggleColumn,
    state,
    setIolAuto,
    loadingQuotes,
    loadingIol,
    refetchAll,
  } = useEtr();

  const [filtroMoneda, setFiltroMoneda] = useState<"todas" | "ARS" | "USD">("todas");
  const [filtroMercado, setFiltroMercado] = useState<"todos" | Mercado>("todos");
  const [agruparPor, setAgruparPor] = useState<"moneda" | "mercado" | "tipo" | "sector">("moneda");
  const [nuevaCol, setNuevaCol] = useState("");

  const rowsBase = useMemo(() => {
    let r = [...holdings].sort((a, b) => valuado(b) - valuado(a));
    if (filtroMoneda !== "todas") r = r.filter((h) => (h.moneda ?? "ARS") === filtroMoneda);
    if (filtroMercado !== "todos") r = r.filter((h) => h.mercado === filtroMercado);
    return r;
  }, [holdings, filtroMoneda, filtroMercado]);

  const grupos = useMemo(() => {
    if (agruparPor === "moneda") {
      const g: Record<string, typeof rowsBase> = { ARS: [], USD: [] };
      for (const h of rowsBase) g[h.moneda ?? "ARS"]?.push(h);
      return g;
    }
    if (agruparPor === "mercado") {
      const g: Record<string, typeof rowsBase> = {};
      for (const m of MERCADOS) g[m] = [];
      g["Sin mercado"] = [];
      for (const h of rowsBase) (g[h.mercado ?? "Sin mercado"] ?? g["Sin mercado"]).push(h);
      return Object.fromEntries(Object.entries(g).filter(([, v]) => v.length)) as Record<string, typeof rowsBase>;
    }
    if (agruparPor === "tipo") {
      const g: Record<string, typeof rowsBase> = {};
      for (const h of rowsBase) {
        const k = h.categoria || h.tipoInstrumento || h.clase || "Sin tipo";
        if (!g[k]) g[k] = [];
        g[k].push(h);
      }
      return g;
    }
    // sector
    const g: Record<string, typeof rowsBase> = {};
    for (const h of rowsBase) {
      const k = h.sector ? `${h.sector} — ${h.industria ?? ""}`.trim() : "Sin sector";
      if (!g[k]) g[k] = [];
      g[k].push(h);
    }
    return g;
  }, [rowsBase, agruparPor]);

  const visibleCols = useMemo(() => {
    const base = ["ticker", "sector", "mercado", "moneda", "cantidad", "ppc", "precio", "variacion", "valuado", "peso"];
    const custom = state.customColumns.map((c) => c.id).filter((id) => !state.hiddenColumns.includes(id));
    return [...base.filter((c) => !state.hiddenColumns.includes(c)), ...custom];
  }, [state.customColumns, state.hiddenColumns]);

  return (
    <AppShell title="Tenencias" subtitle="IOL automático + manual · tablas por moneda/mercado/tipo/sector · doble clic + Enter para editar">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valuación total" value={fmtARS(sumValuado(rowsBase))} delta={varDiaCartera} emphasis />
        <Stat label="Resultado no realizado" value={fmtARS(totalResultado)} delta={ytdCartera} hint="YTD ponderado" />
        <Stat label="Posiciones" value={String(rowsBase.length)} hint={`${holdingsIol.length} IOL · ${holdings.length - holdingsIol.length} manuales`} />
        <Stat label="IOL auto" value={state.iolAuto ? "ON" : "OFF"} hint={loadingIol ? "sincronizando…" : "mezcla automática"} />
      </div>

      <Panel className="mt-4" eyebrow="Cartera" title="Filtros y columnas" bodyClassName="flex flex-wrap gap-3 items-end">
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["moneda", "mercado", "tipo", "sector"] as const).map((k) => (
            <button key={k} onClick={() => setAgruparPor(k)} className={`rounded px-2 py-1 text-xs capitalize ${agruparPor === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2"}`}>{k}</button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["todas", "ARS", "USD"] as const).map((k) => (
            <button key={k} onClick={() => setFiltroMoneda(k)} className={`rounded px-2 py-1 text-xs ${filtroMoneda === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{k}</button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["todos", ...MERCADOS] as const).map((k) => (
            <button key={k} onClick={() => setFiltroMercado(k as any)} className={`rounded px-2 py-1 text-xs ${filtroMercado === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{k}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={state.iolAuto} onChange={(e) => setIolAuto(e.target.checked)} /> IOL auto
        </label>
        <div className="ml-auto flex gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
            <Columns3 className="h-3 w-3" />
            <input placeholder="Nueva columna" value={nuevaCol} onChange={(e) => setNuevaCol(e.target.value)} className="bg-transparent text-xs outline-none w-28" />
            <button onClick={() => { if (nuevaCol.trim()) { addColumn({ id: nuevaCol.trim().toLowerCase().replace(/\s+/g, "-"), label: nuevaCol.trim(), key: nuevaCol.trim() }); setNuevaCol(""); } }} className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"><Plus className="h-3 w-3" /></button>
          </div>
          <button onClick={addPosition} className="flex items-center gap-1 rounded-md border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary/10"><Plus className="h-3 w-3" /> Fila</button>
          <button onClick={refetchAll} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"><RefreshCw className={`h-3 w-3 ${loadingQuotes ? "animate-spin" : ""}`} /> Actualizar</button>
        </div>
        {state.customColumns.length > 0 && (
          <div className="w-full flex flex-wrap gap-1 text-xs">
            {state.customColumns.map((c) => (
              <span key={c.id} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${state.hiddenColumns.includes(c.id) ? "opacity-50 line-through" : ""}`}>
                {c.label}
                <button onClick={() => toggleColumn(c.id)} className="hover:text-primary"><EyeOff className="h-3 w-3" /></button>
                <button onClick={() => removeColumn(c.id)} className="hover:text-loss"><Trash2 className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </Panel>

      {Object.entries(grupos).map(([grupo, rows]) => (
        <Panel key={grupo} className="mt-4" eyebrow={agruparPor} title={`${grupo} · ${rows.length} posiciones · ${fmtARS(sumValuado(rows))}`} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-280 text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {visibleCols.includes("ticker") && <th className="px-4 py-2 font-medium">Ticker</th>}
                  {visibleCols.includes("sector") && <th className="px-2 py-2 font-medium">Sector / Industria</th>}
                  {visibleCols.includes("mercado") && <th className="px-2 py-2 font-medium">Mercado</th>}
                  {visibleCols.includes("moneda") && <th className="px-2 py-2 font-medium">Moneda</th>}
                  <th className="px-2 py-2 font-medium">Tipo</th>
                  {visibleCols.includes("cantidad") && <th className="px-2 py-2 text-right font-medium">Cant. <button onClick={() => toggleColumn("cantidad")} className="ml-1"><EyeOff className="h-3 w-3 inline" /></button></th>}
                  {visibleCols.includes("ppc") && <th className="px-2 py-2 text-right font-medium">PPC</th>}
                  {visibleCols.includes("precio") && <th className="px-2 py-2 text-right font-medium">Precio</th>}
                  {visibleCols.includes("variacion") && <th className="px-2 py-2 text-right font-medium">Día</th>}
                  <th className="px-2 py-2 text-right font-medium">Valuado</th>
                  <th className="px-2 py-2 text-right font-medium">Resultado</th>
                  {visibleCols.includes("peso") && <th className="px-2 py-2 text-right font-medium">Peso</th>}
                  {state.customColumns.filter((c) => visibleCols.includes(c.id)).map((c) => (
                    <th key={c.id} className="px-2 py-2 text-right font-medium">{c.label}</th>
                  ))}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((h) => (
                  <tr key={h.ticker} className="hover:bg-surface-2/60">
                    {visibleCols.includes("ticker") && (
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Editable className="num font-semibold" value={h.ticker} onCommit={(raw) => raw.trim() && updatePosition(h.ticker, { ticker: raw.trim().toUpperCase() })} />
                          <Pill tone={h.fuente === "real" ? "gain" : h.fuente === "manual" ? "gold" : "warn"}>{h.fuente}</Pill>
                        </div>
                        <Editable className="text-xs text-muted-foreground" value={h.name} onCommit={(raw) => updatePosition(h.ticker, { name: raw })} />
                      </td>
                    )}
                    {visibleCols.includes("sector") && (
                      <td className="px-2 py-2 text-xs">
                        <div className="text-xs">{h.sector || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{h.industria || ""}</div>
                      </td>
                    )}
                    {visibleCols.includes("mercado") && (
                      <td className="px-2 py-2 text-xs">
                        <Editable value={h.mercado} options={MERCADOS} onCommit={(raw) => updatePosition(h.ticker, { mercado: raw as Mercado })} />
                      </td>
                    )}
                    {visibleCols.includes("moneda") && <td className="px-2 py-2 text-xs">{h.moneda ?? "—"}</td>}
                    <td className="px-2 py-2 text-xs">{h.categoria || h.tipoInstrumento || h.clase}</td>
                    {visibleCols.includes("cantidad") && (
                      <td className="num px-2 py-2 text-right"><Editable align="right" type="number" value={h.cantidad} display={fmtNum(h.cantidad, 0)} onCommit={(raw) => commitNumber(raw, (n) => updatePosition(h.ticker, { cantidad: n }))} /></td>
                    )}
                    {visibleCols.includes("ppc") && (
                      <td className="num px-2 py-2 text-right"><Editable align="right" type="number" value={h.ppc} display={fmtNum(h.ppc)} onCommit={(raw) => commitNumber(raw, (n) => updatePosition(h.ticker, { ppc: n }))} /></td>
                    )}
                    {visibleCols.includes("precio") && (
                      <td className="num px-2 py-2 text-right"><Editable align="right" type="number" value={h.precio} display={fmtNum(h.precio)} onCommit={(raw) => commitNumber(raw, (n) => updateOverride(h.ticker, { precio: n }))} /></td>
                    )}
                    {visibleCols.includes("variacion") && (
                      <td className="px-2 py-2 text-right"><Editable align="right" type="number" value={h.varDia} display={<Delta value={h.varDia} />} onCommit={(raw) => commitNumber(raw, (n) => updateOverride(h.ticker, { varDia: n }))} /></td>
                    )}
                    <td className="num px-2 py-2 text-right">{fmtARS(valuado(h))}</td>
                    <td className={`num px-2 py-2 text-right ${resultado(h) >= 0 ? "text-gain" : "text-loss"}`}>{fmtARS(resultado(h))}</td>
                    {visibleCols.includes("peso") && <td className="num px-2 py-2 text-right text-muted-foreground">{fmtNum(pesoDe(h, totalCartera), 1)}%</td>}
                    {state.customColumns.filter((c) => visibleCols.includes(c.id)).map((c) => (
                      <td key={c.id} className="px-2 py-2 text-right text-xs text-muted-foreground">—</td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {h.fuente === "manual" && (
                          <button title="Volver al dato real" onClick={() => { clearOverride(h.ticker, "precio"); clearOverride(h.ticker, "varDia"); }} className="rounded border border-border p-1"><RefreshCw className="h-3 w-3" /></button>
                        )}
                        <button title="Eliminar fila" onClick={() => removePosition(h.ticker)} className="rounded border border-border p-1 hover:text-loss"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}

      {rowsBase.length === 0 && (
        <Panel className="mt-4"><p className="px-4 py-10 text-center text-sm text-muted-foreground">Sin posiciones para este filtro. Usá «Fila +» y completá el símbolo o activá IOL auto.</p></Panel>
      )}
    </AppShell>
  );
}
