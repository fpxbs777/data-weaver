import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Delta, Stat, Pill } from "@/components/etr/primitives";
import {
  holdings,
  valuado,
  resultado,
  totalCartera,
  totalResultado,
  varDiaCartera,
  ytdCartera,
  fmtARS,
  fmtNum,
  type Holding,
} from "@/lib/etr-data";

export const Route = createFileRoute("/cartera")({
  head: () => ({
    meta: [
      { title: "Tenencias de la cartera propia — ETR Terminal" },
      {
        name: "description",
        content: "Detalle de tenencias, precio promedio de compra, resultado y peso de cada posición de la cartera propia.",
      },
      { property: "og:title", content: "Tenencias — ETR Terminal" },
      {
        property: "og:description",
        content: "Posiciones, resultado no realizado y peso por clase de activo.",
      },
    ],
  }),
  component: Cartera,
});

type SortKey = "valuado" | "varDia" | "ytd" | "resultado";
const CLASES = ["Todas", "Renta variable", "Renta fija", "CEDEAR", "Liquidez"] as const;

function Cartera() {
  const [clase, setClase] = useState<(typeof CLASES)[number]>("Todas");
  const [sort, setSort] = useState<SortKey>("valuado");

  const rows = useMemo(() => {
    const metric = (h: Holding) =>
      sort === "valuado" ? valuado(h) : sort === "resultado" ? resultado(h) : sort === "ytd" ? h.ytd : h.varDia;
    return holdings
      .filter((h) => clase === "Todas" || h.clase === clase)
      .sort((a, b) => metric(b) - metric(a));
  }, [clase, sort]);

  const porClase = Object.entries(
    holdings.reduce<Record<string, number>>((acc, h) => {
      acc[h.clase] = (acc[h.clase] ?? 0) + valuado(h);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <AppShell title="Tenencias" subtitle="Cartera propia del asesor · valuación a precios de cierre">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valuación total" value={fmtARS(totalCartera)} delta={varDiaCartera} hint="variación diaria" emphasis />
        <Stat label="Resultado no realizado" value={fmtARS(totalResultado)} hint="vs. precio promedio de compra" />
        <Stat label="Rendimiento YTD" value={`${fmtNum(ytdCartera, 1)}%`} hint="ponderado por posición" />
        <Stat label="Posiciones" value={String(holdings.length)} hint={`${porClase.length} clases de activo`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Detalle"
          title="Posiciones"
          bodyClassName="p-0"
          action={
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="sort">
                Ordenar por
              </label>
              <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1">
                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                <select
                  id="sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="bg-transparent text-xs outline-none"
                >
                  <option value="valuado">Valuación</option>
                  <option value="varDia">Var. día</option>
                  <option value="ytd">YTD</option>
                  <option value="resultado">Resultado</option>
                </select>
              </div>
            </div>
          }
        >
          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
            {CLASES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClase(c)}
                className={
                  "rounded-full border px-3 py-1 text-xs transition-colors " +
                  (clase === c
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {c}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Activo", "Cantidad", "Precio", "PPC", "Valuado", "Resultado", "Día", "YTD", "Peso"].map((h) => (
                    <th key={h} className="eyebrow px-4 py-2 font-normal last:text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.ticker} className="border-b border-border/60 transition-colors hover:bg-surface-2">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="num font-semibold">{h.ticker}</span>
                        <Pill>{h.mercado}</Pill>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{h.name}</p>
                    </td>
                    <td className="num px-4 py-2.5">{fmtNum(h.cantidad, 0)}</td>
                    <td className="num px-4 py-2.5">{fmtNum(h.precio, 2)}</td>
                    <td className="num px-4 py-2.5 text-muted-foreground">{fmtNum(h.ppc, 2)}</td>
                    <td className="num px-4 py-2.5">{fmtARS(valuado(h))}</td>
                    <td className={"num px-4 py-2.5 " + (resultado(h) >= 0 ? "text-gain" : "text-loss")}>
                      {fmtARS(resultado(h))}
                    </td>
                    <td className="px-4 py-2.5">
                      <Delta value={h.varDia} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Delta value={h.ytd} />
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {fmtNum((valuado(h) / totalCartera) * 100, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel eyebrow="Composición" title="Peso por clase de activo">
          <ul className="space-y-4">
            {porClase.map(([nombre, monto]) => (
              <li key={nombre}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="truncate text-sm">{nombre}</span>
                  <span className="num text-xs text-muted-foreground">
                    {fmtNum((monto / totalCartera) * 100, 1)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(monto / totalCartera) * 100}%` }}
                  />
                </div>
                <p className="num mt-1 text-xs text-muted-foreground">{fmtARS(monto)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
