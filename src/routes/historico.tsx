import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Panel, Stat, Delta, Pill } from "@/components/etr/primitives";
import { useEtr } from "@/lib/etr-store";
import { getBenchmarks } from "@/lib/market.functions";
import { fmtNum } from "@/lib/etr-data";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico y rendimiento YTD — ETR Terminal" },
      {
        name: "description",
        content:
          "Evolución de la cartera base 100 contra Merval y dólar MEP con series reales, y rendimiento YTD por instrumento.",
      },
      { property: "og:title", content: "Histórico & YTD — ETR Terminal" },
      {
        property: "og:description",
        content: "Curva base 100 de la cartera contra benchmarks reales y detalle YTD por activo.",
      },
    ],
  }),
  component: Historico,
});

const BENCHMARKS = [
  { key: "merval", label: "Merval", color: "var(--chart-4)" },
  { key: "mep", label: "Dólar MEP", color: "var(--chart-5)" },
] as const;

type Punto = { mes: string; cartera: number; merval: number; mep: number };

function base100(points: { fecha: string; close: number }[]) {
  const first = points[0]?.close;
  if (!first) return new Map<string, number>();
  return new Map(points.map((p) => [p.fecha.slice(0, 7), (p.close / first) * 100]));
}

function Historico() {
  const { holdings, quotes, ytdCartera, totalCartera } = useEtr();
  const [activos, setActivos] = useState<string[]>(["merval"]);

  const bench = useQuery({
    queryKey: ["benchmarks"],
    queryFn: () => getBenchmarks(),
    staleTime: 15 * 60_000,
  });

  const serie: Punto[] = useMemo(() => {
    const merval = base100(bench.data?.merval ?? []);
    const mep = base100(bench.data?.mep ?? []);

    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    const meses = new Set<string>();
    for (const q of quotes) for (const p of q.monthly) meses.add(p.fecha.slice(0, 7));
    for (const m of merval.keys()) meses.add(m);
    const ordenados = [...meses].sort();

    const valorEn = (mes: string) =>
      holdings.reduce((acc, h) => {
        const q = bySymbol.get(h.symbol);
        const p = q?.monthly.find((x) => x.fecha.slice(0, 7) === mes);
        return acc + h.cantidad * (p ? p.close : 0);
      }, 0);

    const valores = ordenados.map(valorEn);
    const primero = valores.find((v) => v > 0);

    return ordenados.map((mes, i) => ({
      mes,
      cartera: primero ? (valores[i]! / primero) * 100 : 100,
      merval: merval.get(mes) ?? 100,
      mep: mep.get(mes) ?? 100,
    }));
  }, [bench.data, quotes, holdings]);

  const ultimo = serie[serie.length - 1];
  const toggle = (key: string) =>
    setActivos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <AppShell
      title="Histórico & YTD"
      subtitle="Series reales de Yahoo Finance y dólar MEP · cartera reconstruida con las tenencias actuales"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Cartera base 100"
          value={ultimo ? fmtNum(ultimo.cartera, 1) : "—"}
          delta={ultimo ? ultimo.cartera - 100 : 0}
          hint="acumulado del período"
          emphasis
        />
        <Stat label="Merval base 100" value={ultimo ? fmtNum(ultimo.merval, 1) : "—"} delta={ultimo ? ultimo.merval - 100 : 0} />
        <Stat label="Dólar MEP base 100" value={ultimo ? fmtNum(ultimo.mep, 1) : "—"} delta={ultimo ? ultimo.mep - 100 : 0} />
      </div>

      <Panel
        className="mt-4"
        eyebrow="Evolución"
        title="Cartera vs. benchmarks (base 100)"
        action={
          <div className="flex gap-2">
            {BENCHMARKS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => toggle(b.key)}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  activos.includes(b.key)
                    ? "border-primary/50 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        }
      >
        {serie.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {bench.isLoading ? "Descargando series históricas…" : "Cargá posiciones para reconstruir la curva."}
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCartera" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtNum(v, 1)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="cartera"
                  name="Cartera ETR"
                  stroke="var(--color-primary)"
                  fill="url(#gCartera)"
                  strokeWidth={2}
                />
                {BENCHMARKS.filter((b) => activos.includes(b.key)).map((b) => (
                  <Line key={b.key} type="monotone" dataKey={b.key} name={b.label} stroke={b.color} dot={false} strokeWidth={1.5} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel className="mt-4" eyebrow="Detalle" title="Rendimiento YTD por instrumento" bodyClassName="p-0">
        {holdings.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Sin posiciones cargadas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...holdings]
              .sort((a, b) => b.ytd - a.ytd)
              .map((h) => (
                <li key={h.ticker} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="num truncate text-sm font-semibold">{h.ticker}</span>
                      <Pill>{h.clase}</Pill>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{h.name}</p>
                  </div>
                  <Delta value={h.ytd} />
                </li>
              ))}
            <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-surface-2 px-4 py-3">
              <span className="text-sm font-semibold">Cartera ponderada · {fmtNum(totalCartera, 0)} ARS</span>
              <Delta value={ytdCartera} />
            </li>
          </ul>
        )}
      </Panel>
    </AppShell>
  );
}
