import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta, Bar, Pill } from "@/components/etr/primitives";
import {
  holdings,
  valuado,
  totalCartera,
  totalResultado,
  varDiaCartera,
  ytdCartera,
  liquidez,
  totalAUM,
  clientes,
  alertas,
  modelo,
  pesoReal,
  fmtARS,
  fmtPct,
  fmtNum,
} from "@/lib/etr-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ETR Terminal — Resumen de carteras y clientes" },
      {
        name: "description",
        content:
          "Tablero ETR: patrimonio bajo asesoramiento, variación diaria, desvíos del modelo y alertas en una sola vista.",
      },
      { property: "og:title", content: "ETR Terminal — Resumen" },
      {
        property: "og:description",
        content: "Patrimonio, variación diaria, convergencia del modelo y alertas del día.",
      },
    ],
  }),
  component: Resumen,
});

function Resumen() {
  const top = [...holdings]
    .filter((h) => h.clase !== "Liquidez")
    .sort((a, b) => b.varDia - a.varDia);
  const desvios = modelo
    .map((m) => ({ ...m, real: pesoReal(m.ticker), drift: pesoReal(m.ticker) - m.target }))
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
    .slice(0, 4);

  return (
    <AppShell title="Resumen" subtitle="Estado consolidado del asesoramiento · cierre 17:00 ART">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Patrimonio asesorado"
          value={fmtARS(totalAUM)}
          hint={`${clientes.length} clientes + cartera propia`}
          emphasis
        />
        <Stat label="Cartera propia" value={fmtARS(totalCartera)} delta={varDiaCartera} hint="variación diaria" />
        <Stat label="Resultado no realizado" value={fmtARS(totalResultado)} delta={ytdCartera} hint="YTD ponderado" />
        <Stat
          label="Liquidez disponible"
          value={fmtARS(liquidez)}
          hint={`${fmtNum((liquidez / totalCartera) * 100, 1)}% de la cartera`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          eyebrow="Cartera propia"
          title="Mayores movimientos del día"
          className="xl:col-span-2"
          bodyClassName="p-0"
          action={
            <Link to="/cartera" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver tenencias <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {top.map((h) => (
              <li key={h.ticker} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="num truncate text-sm font-semibold">{h.ticker}</span>
                    <Pill>{h.clase}</Pill>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{h.name}</p>
                </div>
                <div className="text-right">
                  <p className="num text-sm">{fmtARS(valuado(h))}</p>
                  <Delta value={h.varDia} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel eyebrow="Sistema" title="Alertas activas" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {alertas.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <p className="min-w-0 text-sm font-medium">{a.titulo}</p>
                  <Pill tone={a.nivel === "critico" ? "loss" : a.nivel === "atencion" ? "warn" : "neutral"}>
                    {a.hora}
                  </Pill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.detalle}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          eyebrow="Asesoría"
          title="Desvíos frente al modelo ETR"
          action={
            <Link to="/modelo" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Convergencia <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
        >
          <ul className="space-y-3">
            {desvios.map((d) => (
              <li key={d.ticker}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="num truncate text-sm">{d.ticker}</span>
                  <span className="num text-xs text-muted-foreground">
                    {fmtNum(d.real, 1)}% / obj. {d.target}%
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar
                    value={Math.abs(d.drift)}
                    max={6}
                    tone={Math.abs(d.drift) > 4 ? "loss" : Math.abs(d.drift) > 2 ? "warn" : "gain"}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          eyebrow="Asesoría"
          title="Clientes con mayor desvío"
          bodyClassName="p-0"
          action={
            <Link to="/clientes" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver cartera de clientes <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {[...clientes]
              .sort((a, b) => b.drift - a.drift)
              .slice(0, 4)
              .map((c) => (
                <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nombre}</p>
                    <p className="num truncate text-xs text-muted-foreground">
                      {c.id} · {c.perfil}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm">{fmtARS(c.patrimonio)}</p>
                    <span className="num text-xs text-warn">desvío {fmtPct(c.drift)}</span>
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
