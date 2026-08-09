import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Delta, Stat } from "@/components/etr/primitives";
import { indices, divisas, macro, fmtNum } from "@/lib/etr-data";

export const Route = createFileRoute("/mercado")({
  head: () => ({
    meta: [
      { title: "Mercado & Macro — ETR Terminal" },
      {
        name: "description",
        content: "Índices, tipos de cambio e indicadores macro del BCRA e INDEC en una vista única de ETR Terminal.",
      },
      { property: "og:title", content: "Mercado & Macro — ETR Terminal" },
      {
        property: "og:description",
        content: "Índices, dólares e indicadores macro consolidados para el asesor.",
      },
    ],
  }),
  component: Mercado,
});

function Tabla({ rows }: { rows: typeof indices }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.label}</p>
            <p className="num truncate text-xs text-muted-foreground">{r.symbol}</p>
          </div>
          <div className="text-right">
            <p className="num text-sm">
              {fmtNum(r.value, r.unit === "bps" || r.unit === "pts" ? 0 : 2)}
              <span className="ml-1 text-xs text-muted-foreground">{r.unit}</span>
            </p>
            <Delta value={r.changePct} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Mercado() {
  return (
    <AppShell title="Mercado & Macro" subtitle="Índices, tipo de cambio y contexto macroeconómico">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Renta variable" title="Índices" bodyClassName="p-0">
          <Tabla rows={indices} />
        </Panel>
        <Panel eyebrow="Tipo de cambio" title="Dólares" bodyClassName="p-0">
          <Tabla rows={divisas} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {macro.map((m) => (
          <Stat key={m.label} label={m.label} value={m.value} hint={m.detail} />
        ))}
      </div>
    </AppShell>
  );
}
