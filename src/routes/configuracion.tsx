import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel } from "@/components/etr/primitives";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración de la terminal — ETR Terminal" },
      {
        name: "description",
        content: "Ajustes de conexión con IOL, frecuencia de actualización, umbrales de desvío y notificaciones de ETR Terminal.",
      },
      { property: "og:title", content: "Configuración — ETR Terminal" },
      {
        property: "og:description",
        content: "Conexión de datos, umbrales de rebalanceo y alertas.",
      },
    ],
  }),
  component: Configuracion,
});

function Row({
  label,
  detail,
  children,
}: {
  label: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function Configuracion() {
  const [alertas, setAlertas] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [umbral, setUmbral] = useState(1.5);
  const [intervalo, setIntervalo] = useState("60");

  return (
    <AppShell title="Configuración" subtitle="Preferencias de la terminal (se aplican a todas las vistas)">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Datos" title="Conexión y actualización" bodyClassName="p-0">
          <Row label="Cuenta IOL" detail="Sesión de asesor conectada · token vigente">
            <span className="num rounded-full border border-gain/40 px-2 py-0.5 text-[11px] text-gain">Activa</span>
          </Row>
          <Row label="Actualización automática" detail="Refresca cotizaciones y tenencias en segundo plano">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </Row>
          <Row label="Intervalo" detail="Frecuencia de sincronización con el mercado">
            <select
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
              aria-label="Intervalo de actualización"
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none"
            >
              <option value="30">30 s</option>
              <option value="60">1 min</option>
              <option value="300">5 min</option>
            </select>
          </Row>
        </Panel>

        <Panel eyebrow="Asesoría" title="Umbrales y notificaciones" bodyClassName="p-0">
          <Row label="Umbral de desvío" detail={`Marca un activo fuera de banda a partir de ±${umbral.toFixed(1)} p.p.`}>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={umbral}
              onChange={(e) => setUmbral(Number(e.target.value))}
              aria-label="Umbral de desvío"
              className="w-36 accent-[var(--primary)]"
            />
          </Row>
          <Row label="Alertas en la terminal" detail="Avisos de desvío, liquidez y datos macro nuevos">
            <Switch checked={alertas} onCheckedChange={setAlertas} />
          </Row>
          <Row label="Moneda de referencia" detail="Base de valuación de carteras y reportes">
            <select
              aria-label="Moneda de referencia"
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none"
            >
              <option>ARS</option>
              <option>USD MEP</option>
              <option>USD CCL</option>
            </select>
          </Row>
        </Panel>
      </div>
    </AppShell>
  );
}
