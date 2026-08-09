import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta, Pill } from "@/components/etr/primitives";
import { clientes, fmtARS, fmtNum, totalAUM, type Client } from "@/lib/etr-data";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes asesorados — ETR Terminal" },
      {
        name: "description",
        content: "Listado de clientes con patrimonio, perfil de riesgo, variación diaria y desvío frente al modelo ETR.",
      },
      { property: "og:title", content: "Clientes — ETR Terminal" },
      {
        property: "og:description",
        content: "Patrimonio, perfil y desvío de cada cliente asesorado.",
      },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Client>(clientes[0]!);

  const rows = useMemo(
    () =>
      clientes
        .filter((c) => `${c.nombre} ${c.id} ${c.perfil}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.patrimonio - a.patrimonio),
    [q],
  );

  const aum = clientes.reduce((a, c) => a + c.patrimonio, 0);
  const varDia = clientes.reduce((a, c) => a + c.patrimonio * c.varDia, 0) / aum;

  return (
    <AppShell title="Clientes" subtitle="Carteras asesoradas · datos consolidados por cliente">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Patrimonio de clientes" value={fmtARS(aum)} delta={varDia} hint="variación diaria ponderada" emphasis />
        <Stat label="Clientes activos" value={String(clientes.length)} hint={`${fmtNum((aum / totalAUM) * 100, 0)}% del total asesorado`} />
        <Stat
          label="Desvío promedio"
          value={`${fmtNum(clientes.reduce((a, c) => a + c.drift, 0) / clientes.length, 1)} p.p.`}
          hint="frente al modelo ETR"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Cartera de clientes"
          title="Listado"
          bodyClassName="p-0"
          action={
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar cliente"
                aria-label="Buscar cliente"
                className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground sm:w-44"
              />
            </div>
          }
        >
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSel(c)}
                  className={
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors " +
                    (sel.id === c.id ? "bg-surface-2" : "hover:bg-surface-2/60")
                  }
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.nombre}</span>
                      <Pill tone={c.perfil === "Agresivo" ? "loss" : c.perfil === "Moderado" ? "warn" : "gain"}>
                        {c.perfil}
                      </Pill>
                    </div>
                    <p className="num truncate text-xs text-muted-foreground">
                      {c.id} · última operación {c.ultimaOperacion}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm">{fmtARS(c.patrimonio)}</p>
                    <Delta value={c.varDia} />
                  </div>
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">Sin coincidencias.</li>
            )}
          </ul>
        </Panel>

        <Panel eyebrow="Detalle" title={sel.nombre}>
          <dl className="space-y-3 text-sm">
            {[
              ["Identificador", sel.id],
              ["Perfil de riesgo", sel.perfil],
              ["Patrimonio", fmtARS(sel.patrimonio)],
              ["Variación diaria", `${fmtNum(sel.varDia, 2)}%`],
              ["Rendimiento YTD", `${fmtNum(sel.ytd, 1)}%`],
              ["Desvío del modelo", `${fmtNum(sel.drift, 1)} p.p.`],
              ["Última operación", sel.ultimaOperacion],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-2">
                <dt className="truncate text-xs text-muted-foreground">{k}</dt>
                <dd className="num text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Para ver órdenes sugeridas de rebalanceo, seleccioná este cliente en Modelo & Convergencia.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
