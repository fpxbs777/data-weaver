import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta } from "@/components/etr/primitives";
import { serieHistorica, holdings, fmtNum, ytdCartera } from "@/lib/etr-data";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico y rendimiento YTD — ETR Terminal" },
      {
        name: "description",
        content: "Evolución de la cartera propia base 100 contra Merval y dólar MEP, con rendimientos YTD por instrumento.",
      },
      { property: "og:title", content: "Histórico & YTD — ETR Terminal" },
      {
        property: "og:description",
        content: "Curva base 100 de la cartera contra benchmarks y detalle YTD por activo.",
      },
    ],
  }),
  component: Historico,
});

const BENCHMARKS = [
  { key: "merval", label: "Merval", color: "var(--chart-4)" },
  { key: "mep", label: "Dólar MEP", color: "var(--chart-5)" },
] as const;

function Historico() {
  const [activos, setActivos] = useState<string[]>(["merval"]);
  const ultimo = serieHistorica[serieHistorica.length - 1]!;

  const toggle = (key: string) =>
    setActivos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <AppShell
      title="Histórico & YTD"
      subtitle="Serie reconstruida con tenencias actuales × precios históricos (aproximada)"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Cartera base 100" value={fmtNum(ultimo.cartera, 1)} delta={ultimo.cartera - 100} hint="acumulado del año" emphasis />
        <Stat label="Merval base 100" value={fmtNum(ultimo.merval, 1)} delta={ultimo.merval - 100} />
        <Stat label="Dólar MEP base 100" value={fmtNum(ultimo.mep, 1)} delta={ultimo.mep - 100} />
      </div>

      <Panel
        className="mt-4"
        eyebrow="Evolución"
        title="Cartera vs. benchmarks (base 100)"
        action={
          <div className="flex gap-1.5">
            {BENCHMARKS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => toggle(b.key)}
                className={
                  "rounded-full border px-3 py-1 text-xs transition-colors " +
                  (activos.includes(b.key)
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {b.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serieHistorica} margin={{ left: -18, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillCartera" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="fecha" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="cartera"
                name="Cartera ETR"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#fillCartera)"
              />
              {BENCHMARKS.filter((b) => activos.includes(b.key)).map((b) => (
                <Line
                  key={b.key}
                  type="monotone"
                  dataKey={b.key}
                  name={b.label}
                  stroke={b.color}
                  strokeWidth={1.6}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel className="mt-4" eyebrow="Detalle" title={`Rendimiento YTD por instrumento · cartera ${fmtNum(ytdCartera, 1)}%`} bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {[...holdings]
            .filter((h) => h.clase !== "Liquidez")
            .sort((a, b) => b.ytd - a.ytd)
            .map((h) => (
              <li key={h.ticker} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="num truncate text-sm font-semibold">{h.ticker}</p>
                  <p className="truncate text-xs text-muted-foreground">{h.name}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-muted sm:block">
                    <div className="h-full rounded-full bg-gain" style={{ width: `${(h.ytd / 40) * 100}%` }} />
                  </div>
                  <Delta value={h.ytd} />
                </div>
              </li>
            ))}
        </ul>
      </Panel>
    </AppShell>
  );
}
