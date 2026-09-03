import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta, Bar, Pill } from "@/components/etr/primitives";
import { IndicesArsUsdWidget } from "@/components/market/IndicesArsUsdWidget";
import { useEtr } from "@/lib/etr-store";
import { valuado, fmtARS, fmtPct, fmtNum } from "@/lib/etr-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ETR Terminal — Resumen de carteras y clientes" },
      {
        name: "description",
        content:
          "Tablero ETR: patrimonio bajo asesoramiento, variación diaria en vivo, desvíos del modelo y alertas en una sola vista.",
      },
      { property: "og:title", content: "ETR Terminal — Resumen" },
      {
        property: "og:description",
        content: "Patrimonio, variación diaria, convergencia del modelo y alertas del día con datos reales.",
      },
    ],
  }),
  component: Resumen,
});

function Resumen() {
  const {
    holdings,
    totalCartera,
    totalResultado,
    varDiaCartera,
    ytdCartera,
    liquidez,
    totalAUM,
    state,
    alertas,
    pesoReal,
  } = useEtr();

  const top = [...holdings].filter((h) => h.clase !== "Liquidez").sort((a, b) => b.varDia - a.varDia);
  const desvios = state.modelo
    .map((m) => ({ ...m, real: pesoReal(m.ticker), drift: pesoReal(m.ticker) - m.target }))
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
    .slice(0, 4);

  const hasData = holdings.length > 0 || state.clientes.length > 0 || totalAUM > 0;

  return (
    <AppShell title="Resumen" subtitle="Estado consolidado del asesoramiento · cotizaciones en vivo">
      <div className="mt-4">
        <IndicesArsUsdWidget />
      </div>
      {hasData ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Patrimonio asesorado"
            value={fmtARS(totalAUM)}
            hint={`${state.clientes.length} clientes + cartera propia`}
            emphasis
          />
          <Stat label="Cartera propia" value={fmtARS(totalCartera)} delta={varDiaCartera} hint="variación diaria" />
          <Stat label="Resultado no realizado" value={fmtARS(totalResultado)} delta={ytdCartera} hint="YTD ponderado" />
          <Stat
            label="Liquidez disponible"
            value={fmtARS(liquidez)}
            hint={totalCartera ? `${fmtNum((liquidez / totalCartera) * 100, 1)}% de la cartera` : "sin posiciones"}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {top.length > 0 && (
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
                      {h.fuente === "manual" && <Pill tone="gold">manual</Pill>}
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
        )}

        {alertas.length > 0 && (
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
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {desvios.length > 0 && (
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
        )}

        {state.clientes.length > 0 && (
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
              {[...state.clientes]
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
        )}
      </div>
      {!hasData && top.length === 0 && alertas.length === 0 && desvios.length === 0 && state.clientes.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Cargá posiciones en Tenencias o conectá IOL para ver el resumen.</p>
          <Link to="/cartera" className="mt-2 inline-flex text-sm text-primary hover:underline">Ir a Tenencias →</Link>
        </div>
      )}
    </AppShell>
  );
}
