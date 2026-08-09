import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Pill } from "@/components/etr/primitives";
import {
  modelo,
  pesoReal,
  totalCartera,
  fmtARS,
  fmtNum,
  fmtPct,
  clientes,
} from "@/lib/etr-data";

export const Route = createFileRoute("/modelo")({
  head: () => ({
    meta: [
      { title: "Modelo ETR y convergencia de carteras — ETR Terminal" },
      {
        name: "description",
        content: "Pesos objetivo del modelo ETR, desvío de la cartera real y órdenes sugeridas para converger.",
      },
      { property: "og:title", content: "Modelo & Convergencia — ETR Terminal" },
      {
        property: "og:description",
        content: "Comparación entre pesos objetivo y cartera real con sugerencias de rebalanceo.",
      },
    ],
  }),
  component: Modelo,
});

function Modelo() {
  const [scope, setScope] = useState<string>("propia");

  const factor = useMemo(() => {
    if (scope === "propia") return 1;
    const c = clientes.find((x) => x.id === scope);
    return c ? 1 + c.drift / 100 : 1;
  }, [scope]);

  const base = scope === "propia" ? totalCartera : (clientes.find((c) => c.id === scope)?.patrimonio ?? totalCartera);

  const filas = modelo.map((m) => {
    const real = pesoReal(m.ticker) * factor;
    const drift = real - m.target;
    return { ...m, real, drift, monto: (drift / 100) * base };
  });

  const driftTotal = filas.reduce((a, f) => a + Math.abs(f.drift), 0) / 2;
  const aRebalancear = filas.filter((f) => Math.abs(f.drift) >= 1.5);

  return (
    <AppShell title="Modelo & Convergencia" subtitle="Pesos objetivo ETR frente a la cartera seleccionada">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Desvío total" value={`${fmtNum(driftTotal, 1)} p.p.`} hint="suma de desvíos absolutos / 2" emphasis />
        <Stat label="Activos fuera de banda" value={String(aRebalancear.length)} hint="umbral ±1,5 p.p." />
        <Stat label="Patrimonio evaluado" value={fmtARS(base)} hint={scope === "propia" ? "cartera propia" : scope} />
      </div>

      <Panel
        className="mt-4"
        eyebrow="Convergencia"
        title="Modelo vs. cartera real"
        bodyClassName="p-0"
        action={
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Seleccionar cartera"
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none"
          >
            <option value="propia">Cartera propia</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Activo", "Clase", "Objetivo", "Real", "Desvío", "Acción sugerida"].map((h) => (
                  <th key={h} className="eyebrow px-4 py-2 font-normal last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const vender = f.drift > 0;
                const fuera = Math.abs(f.drift) >= 1.5;
                return (
                  <tr key={f.ticker} className="border-b border-border/60 transition-colors hover:bg-surface-2">
                    <td className="num px-4 py-2.5 font-semibold">{f.ticker}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{f.clase}</td>
                    <td className="num px-4 py-2.5">{f.target}%</td>
                    <td className="num px-4 py-2.5">{fmtNum(f.real, 1)}%</td>
                    <td className={"num px-4 py-2.5 " + (fuera ? (vender ? "text-loss" : "text-warn") : "text-muted-foreground")}>
                      {fmtPct(f.drift)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {fuera ? (
                        <Pill tone={vender ? "loss" : "gain"}>
                          {vender ? "Vender" : "Comprar"} {fmtARS(Math.abs(f.monto))}
                        </Pill>
                      ) : (
                        <Pill>En banda</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
