import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta, Pill } from "@/components/etr/primitives";
import { Editable, commitNumber } from "@/components/etr/editable";
import { useEtr } from "@/lib/etr-store";
import {
  CLASES,
  fmtARS,
  fmtNum,
  pesoDe,
  resultado,
  valuado,
  type Clase,
  type Mercado,
} from "@/lib/etr-data";

const MERCADOS: Mercado[] = ["BCBA", "NYSE", "NASDAQ"];

export const Route = createFileRoute("/cartera")({
  head: () => ({
    meta: [
      { title: "Tenencias de cartera en vivo — ETR Terminal" },
      {
        name: "description",
        content:
          "Posiciones con precios reales de Yahoo Finance, valuación, resultado y peso por activo. Editables con doble clic.",
      },
      { property: "og:title", content: "Tenencias — ETR Terminal" },
      {
        property: "og:description",
        content: "Cartera con cotizaciones en vivo, resultado no realizado y edición manual de cada dato.",
      },
    ],
  }),
  component: Cartera,
});

function Cartera() {
  const {
    holdings,
    totalCartera,
    totalResultado,
    varDiaCartera,
    ytdCartera,
    updatePosition,
    updateOverride,
    clearOverride,
    addPosition,
    removePosition,
    loadingQuotes,
    refetchAll,
  } = useEtr();

  const rows = [...holdings].sort((a, b) => valuado(b) - valuado(a));

  return (
    <AppShell title="Tenencias" subtitle="Precios en vivo · doble clic en cualquier dato para editarlo y Enter para guardar">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valuación total" value={fmtARS(totalCartera)} delta={varDiaCartera} emphasis />
        <Stat label="Resultado no realizado" value={fmtARS(totalResultado)} delta={ytdCartera} hint="YTD ponderado" />
        <Stat label="Posiciones" value={String(holdings.length)} hint={`${rows.filter((r) => r.fuente === "real").length} con cotización en línea`} />
        <Stat
          label="Sobreescritas a mano"
          value={String(rows.filter((r) => r.fuente === "manual").length)}
          hint="tienen valores cargados por el asesor"
        />
      </div>

      <Panel
        className="mt-4"
        eyebrow="Cartera propia"
        title="Detalle de posiciones"
        bodyClassName="p-0"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refetchAll}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
            >
              <RefreshCw className={`h-3 w-3 ${loadingQuotes ? "animate-spin" : ""}`} /> Actualizar
            </button>
            <button
              type="button"
              onClick={addPosition}
              className="flex items-center gap-1 rounded-md border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" /> Agregar
            </button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No hay posiciones cargadas. Usá «Agregar» y completá el símbolo de Yahoo Finance (por ej. <span className="num">GGAL.BA</span>) para traer el precio real.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Ticker</th>
                  <th className="px-2 py-2 font-medium">Clase</th>
                  <th className="px-2 py-2 font-medium">Símbolo</th>
                  <th className="px-2 py-2 text-right font-medium">Cant.</th>
                  <th className="px-2 py-2 text-right font-medium">PPC</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">Día</th>
                  <th className="px-2 py-2 text-right font-medium">YTD</th>
                  <th className="px-2 py-2 text-right font-medium">Valuado</th>
                  <th className="px-2 py-2 text-right font-medium">Resultado</th>
                  <th className="px-2 py-2 text-right font-medium">Peso</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((h) => (
                  <tr key={h.ticker} className="hover:bg-surface-2/60">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Editable
                          className="num font-semibold"
                          value={h.ticker}
                          onCommit={(raw) => raw.trim() && updatePosition(h.ticker, { ticker: raw.trim().toUpperCase() })}
                        />
                        <Pill tone={h.fuente === "real" ? "gain" : h.fuente === "manual" ? "gold" : "warn"}>
                          {h.fuente}
                        </Pill>
                      </div>
                      <Editable
                        className="text-xs text-muted-foreground"
                        value={h.name}
                        onCommit={(raw) => updatePosition(h.ticker, { name: raw })}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <Editable
                        value={h.clase}
                        options={CLASES}
                        onCommit={(raw) => updatePosition(h.ticker, { clase: raw as Clase })}
                      />
                      <div className="text-[11px] text-muted-foreground">
                        <Editable
                          value={h.mercado}
                          options={MERCADOS}
                          onCommit={(raw) => updatePosition(h.ticker, { mercado: raw as Mercado })}
                        />
                      </div>
                    </td>
                    <td className="num px-2 py-2 text-xs">
                      <Editable
                        value={h.symbol}
                        display={h.symbol || "—"}
                        onCommit={(raw) => updatePosition(h.ticker, { symbol: raw.trim() })}
                        title="Símbolo de Yahoo Finance. Doble clic para editar"
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={h.cantidad}
                        display={fmtNum(h.cantidad, 0)}
                        onCommit={(raw) => commitNumber(raw, (n) => updatePosition(h.ticker, { cantidad: n }))}
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={h.ppc}
                        display={fmtNum(h.ppc)}
                        onCommit={(raw) => commitNumber(raw, (n) => updatePosition(h.ticker, { ppc: n }))}
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={h.precio}
                        display={fmtNum(h.precio)}
                        onCommit={(raw) => commitNumber(raw, (n) => updateOverride(h.ticker, { precio: n }))}
                        title="Doble clic para fijar un precio manual · Enter para guardar"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={h.varDia}
                        display={<Delta value={h.varDia} />}
                        onCommit={(raw) => commitNumber(raw, (n) => updateOverride(h.ticker, { varDia: n }))}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={h.ytd}
                        display={<Delta value={h.ytd} />}
                        onCommit={(raw) => commitNumber(raw, (n) => updateOverride(h.ticker, { ytd: n }))}
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">{fmtARS(valuado(h))}</td>
                    <td
                      className={`num px-2 py-2 text-right ${resultado(h) >= 0 ? "text-gain" : "text-loss"}`}
                    >
                      {fmtARS(resultado(h))}
                    </td>
                    <td className="num px-2 py-2 text-right text-muted-foreground">
                      {fmtNum(pesoDe(h, totalCartera), 1)}%
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {h.fuente === "manual" && (
                          <button
                            type="button"
                            title="Volver al dato real"
                            onClick={() => {
                              clearOverride(h.ticker, "precio");
                              clearOverride(h.ticker, "varDia");
                              clearOverride(h.ticker, "ytd");
                            }}
                            className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Eliminar posición"
                          onClick={() => removePosition(h.ticker)}
                          className="rounded border border-border p-1 text-muted-foreground hover:text-loss"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
