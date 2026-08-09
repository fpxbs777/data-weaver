import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Delta, Pill } from "@/components/etr/primitives";
import { Editable, commitNumber } from "@/components/etr/editable";
import { useEtr, type MercadoRow } from "@/lib/etr-store";
import { fmtNum } from "@/lib/etr-data";

export const Route = createFileRoute("/mercado")({
  head: () => ({
    meta: [
      { title: "Mercado en vivo: Merval, dólares y macro — ETR Terminal" },
      {
        name: "description",
        content:
          "Índices, tipos de cambio y variables macro argentinas con datos reales de Yahoo Finance, DolarApi y BCRA.",
      },
      { property: "og:title", content: "Mercado — ETR Terminal" },
      {
        property: "og:description",
        content: "Merval, S&P 500, dólar MEP/CCL/blue, riesgo país e inflación actualizados en vivo.",
      },
    ],
  }),
  component: MercadoView,
});

function Tabla({ rows, titulo, eyebrow }: { rows: MercadoRow[]; titulo: string; eyebrow: string }) {
  const { updateMercadoRow } = useEtr();
  return (
    <Panel eyebrow={eyebrow} title={titulo} bodyClassName="p-0">
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sincronizando datos…</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <Editable
                  className="truncate text-sm font-medium"
                  value={r.label}
                  onCommit={(raw) => updateMercadoRow(r.symbol, { label: raw })}
                />
                <div className="flex items-center gap-2">
                  <span className="num text-xs text-muted-foreground">{r.symbol}</span>
                  {r.editado && <Pill tone="gold">manual</Pill>}
                </div>
              </div>
              <div className="text-right">
                <Editable
                  align="right"
                  type="number"
                  className="num text-sm"
                  value={r.value}
                  display={`${fmtNum(r.value, r.unit === "bps" ? 0 : 2)} ${r.unit}`}
                  onCommit={(raw) => commitNumber(raw, (n) => updateMercadoRow(r.symbol, { value: n }))}
                />
                <div>
                  <Editable
                    align="right"
                    type="number"
                    value={r.changePct}
                    display={<Delta value={r.changePct} />}
                    onCommit={(raw) => commitNumber(raw, (n) => updateMercadoRow(r.symbol, { changePct: n }))}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MercadoView() {
  const { mercadoRows, updateMacroRow, loadingMercado, refetchAll, mercado } = useEtr();

  return (
    <AppShell
      title="Mercado"
      subtitle="Yahoo Finance · DolarApi · BCRA · ArgentinaDatos — doble clic para corregir un valor y Enter para guardar"
    >
      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {mercado
            ? `Última sincronización ${new Date(mercado.updatedAt).toLocaleTimeString("es-AR")}`
            : "Sin datos todavía"}
        </span>
        <button
          type="button"
          onClick={refetchAll}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface-2"
        >
          <RefreshCw className={`h-3 w-3 ${loadingMercado ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Tabla eyebrow="Renta variable" titulo="Índices y riesgo país" rows={mercadoRows.indices} />
        <Tabla eyebrow="Cambiario" titulo="Tipos de cambio" rows={mercadoRows.divisas} />
      </div>

      <Panel className="mt-4" eyebrow="Macro" title="Variables argentinas" bodyClassName="p-0">
        {mercadoRows.macro.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sincronizando indicadores…</p>
        ) : (
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            {mercadoRows.macro.map((m) => (
              <div key={m.key} className="bg-card px-4 py-3">
                <div className="flex items-center gap-2">
                  <Editable
                    className="eyebrow truncate"
                    value={m.label}
                    onCommit={(raw) => updateMacroRow(m.key, { label: raw })}
                  />
                  {m.editado && <Pill tone="gold">manual</Pill>}
                </div>
                <Editable
                  className="num mt-1 block text-lg font-semibold"
                  value={m.value}
                  onCommit={(raw) => updateMacroRow(m.key, { value: raw })}
                />
                <Editable
                  className="block text-xs text-muted-foreground"
                  value={m.detail}
                  onCommit={(raw) => updateMacroRow(m.key, { detail: raw })}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
