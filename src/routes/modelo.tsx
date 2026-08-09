import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Bar, Pill } from "@/components/etr/primitives";
import { Editable, commitNumber } from "@/components/etr/editable";
import { useEtr } from "@/lib/etr-store";
import { CLASES, fmtARS, fmtNum, type Clase } from "@/lib/etr-data";

export const Route = createFileRoute("/modelo")({
  head: () => ({
    meta: [
      { title: "Modelo ETR y convergencia de carteras — ETR Terminal" },
      {
        name: "description",
        content:
          "Pesos objetivo del modelo ETR contra los pesos reales de la cartera, con órdenes sugeridas de rebalanceo.",
      },
      { property: "og:title", content: "Modelo & Convergencia — ETR Terminal" },
      {
        property: "og:description",
        content: "Desvíos por activo y montos a comprar o vender para converger al modelo ETR.",
      },
    ],
  }),
  component: Modelo,
});

function Modelo() {
  const {
    state,
    pesoReal,
    totalCartera,
    updateModelo,
    addModelo,
    removeModelo,
    setUmbral,
  } = useEtr();

  const filas = state.modelo.map((m) => {
    const real = pesoReal(m.ticker);
    const drift = real - m.target;
    return { ...m, real, drift, monto: (drift / 100) * totalCartera };
  });

  const targetTotal = filas.reduce((a, f) => a + f.target, 0);
  const fueraDeRango = filas.filter((f) => Math.abs(f.drift) > state.umbral);
  const porClase = CLASES.map((clase) => ({
    clase,
    target: filas.filter((f) => f.clase === clase).reduce((a, f) => a + f.target, 0),
    real: filas.filter((f) => f.clase === clase).reduce((a, f) => a + f.real, 0),
  })).filter((c) => c.target > 0 || c.real > 0);

  return (
    <AppShell title="Modelo & Convergencia" subtitle="Pesos objetivo editables · el peso real surge de las cotizaciones en vivo">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Activos en el modelo" value={String(filas.length)} emphasis />
        <Stat
          label="Suma de objetivos"
          value={`${fmtNum(targetTotal, 1)}%`}
          hint={Math.abs(targetTotal - 100) > 0.5 ? "no suma 100%" : "modelo balanceado"}
        />
        <Stat label="Fuera de banda" value={String(fueraDeRango.length)} hint={`umbral ±${fmtNum(state.umbral, 1)} p.p.`} />
        <div className="panel min-w-0 px-4 py-3">
          <p className="eyebrow truncate">Umbral de tolerancia</p>
          <Editable
            className="num mt-1 block text-xl font-semibold sm:text-2xl"
            type="number"
            value={state.umbral}
            display={`± ${fmtNum(state.umbral, 1)} p.p.`}
            onCommit={(raw) => commitNumber(raw, (n) => setUmbral(Math.abs(n)))}
          />
          <p className="text-xs text-muted-foreground">Doble clic para ajustar · Enter para guardar</p>
        </div>
      </div>

      <Panel
        className="mt-4"
        eyebrow="Asesoría"
        title="Pesos objetivo vs. reales"
        bodyClassName="p-0"
        action={
          <button
            type="button"
            onClick={addModelo}
            className="flex items-center gap-1 rounded-md border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary/10"
          >
            <Plus className="h-3 w-3" /> Agregar activo
          </button>
        }
      >
        {filas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Definí el modelo ETR agregando activos y sus pesos objetivo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-175 text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Ticker</th>
                  <th className="px-2 py-2 font-medium">Clase</th>
                  <th className="px-2 py-2 text-right font-medium">Objetivo</th>
                  <th className="px-2 py-2 text-right font-medium">Real</th>
                  <th className="px-2 py-2 text-right font-medium">Desvío</th>
                  <th className="px-2 py-2 font-medium">Acción sugerida</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => (
                  <tr key={f.ticker} className="hover:bg-surface-2/60">
                    <td className="num px-4 py-2 font-semibold">
                      <Editable
                        value={f.ticker}
                        onCommit={(raw) => raw.trim() && updateModelo(f.ticker, { ticker: raw.trim().toUpperCase() })}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <Editable
                        value={f.clase}
                        options={CLASES}
                        onCommit={(raw) => updateModelo(f.ticker, { clase: raw as Clase })}
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={f.target}
                        display={`${fmtNum(f.target, 1)}%`}
                        onCommit={(raw) => commitNumber(raw, (n) => updateModelo(f.ticker, { target: n }))}
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">{fmtNum(f.real, 1)}%</td>
                    <td className="num px-2 py-2 text-right">
                      <span className={Math.abs(f.drift) > state.umbral ? "text-warn" : "text-muted-foreground"}>
                        {f.drift > 0 ? "+" : ""}
                        {fmtNum(f.drift, 1)} p.p.
                      </span>
                      <div className="mt-1">
                        <Bar
                          value={Math.abs(f.drift)}
                          max={Math.max(state.umbral * 4, 4)}
                          tone={Math.abs(f.drift) > state.umbral * 2 ? "loss" : Math.abs(f.drift) > state.umbral ? "warn" : "gain"}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {Math.abs(f.drift) <= state.umbral ? (
                        <Pill tone="gain">en banda</Pill>
                      ) : (
                        <span className="num">
                          <Pill tone={f.monto > 0 ? "loss" : "gain"}>{f.monto > 0 ? "vender" : "comprar"}</Pill>{" "}
                          {fmtARS(Math.abs(f.monto))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        title="Quitar del modelo"
                        onClick={() => removeModelo(f.ticker)}
                        className="rounded border border-border p-1 text-muted-foreground hover:text-loss"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {porClase.length > 0 && (
        <Panel className="mt-4" eyebrow="Distribución" title="Objetivo vs. real por clase de activo">
          <ul className="space-y-3">
            {porClase.map((c) => (
              <li key={c.clase}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="truncate text-sm">{c.clase}</span>
                  <span className="num text-xs text-muted-foreground">
                    {fmtNum(c.real, 1)}% real / {fmtNum(c.target, 1)}% objetivo
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={c.real} max={Math.max(c.target, c.real, 1)} tone="primary" />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </AppShell>
  );
}
