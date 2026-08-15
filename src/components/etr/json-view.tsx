import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Json } from "@/lib/iol.server";

const NUM = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export function labelize(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function fmtValue(v: Json): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return NUM.format(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") {
    const d = /^\d{4}-\d{2}-\d{2}T/.exec(v);
    if (d) return new Date(v).toLocaleString("es-AR");
    return v;
  }
  return "";
}

function isScalar(v: Json): boolean {
  return v === null || typeof v !== "object";
}

/** Tabla de una lista de objetos con columnas derivadas dinámicamente. */
export function DataGrid({ rows, max = 12 }: { rows: Json[]; max?: number }) {
  const objects = rows.filter((r): r is { [k: string]: Json } => !!r && typeof r === "object" && !Array.isArray(r));
  if (objects.length === 0) return <p className="text-xs text-muted-foreground">Sin registros.</p>;

  const cols = [...new Set(objects.flatMap((o) => Object.keys(o)))]
    .filter((c) => objects.some((o) => isScalar(o[c] ?? null)))
    .slice(0, max);

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border">
            {cols.map((c) => (
              <th key={c} className="eyebrow whitespace-nowrap px-3 py-2 text-left">
                {labelize(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {objects.map((o, i) => (
            <tr key={i} className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2">
              {cols.map((c) => {
                const v = o[c] ?? null;
                const isNum = typeof v === "number";
                return (
                  <td
                    key={c}
                    className={cn(
                      "whitespace-nowrap px-3 py-2",
                      isNum && "num text-right",
                      isNum && v < 0 && "text-loss",
                    )}
                  >
                    {isScalar(v) ? fmtValue(v) : "…"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renderiza cualquier respuesta de la API: escalares, objetos anidados y listas. */
export function JsonBlock({ data, level = 0 }: { data: Json; level?: number }) {
  const [open, setOpen] = useState(level < 1);

  if (data === null || data === undefined) return <p className="text-xs text-muted-foreground">Sin datos.</p>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="text-xs text-muted-foreground">Sin registros.</p>;
    if (data.every((d) => isScalar(d))) {
      return <p className="num text-sm">{data.map((d) => fmtValue(d)).join(" · ")}</p>;
    }
    return <DataGrid rows={data} />;
  }

  if (isScalar(data)) return <p className="num text-sm">{fmtValue(data)}</p>;

  const entries = Object.entries(data as { [k: string]: Json });
  const scalars = entries.filter(([, v]) => isScalar(v));
  const nested = entries.filter(([, v]) => !isScalar(v));

  return (
    <div className="min-w-0 space-y-4">
      {scalars.length > 0 && (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
          {scalars.map(([k, v]) => (
            <div key={k} className="min-w-0 border-b border-border/50 pb-1.5">
              <dt className="eyebrow truncate">{labelize(k)}</dt>
              <dd
                className={cn(
                  "num truncate text-sm",
                  typeof v === "number" && v < 0 && "text-loss",
                  typeof v === "number" && v > 0 && "text-foreground",
                )}
              >
                {fmtValue(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {nested.map(([k, v]) => (
        <div key={k} className="min-w-0 rounded-md border border-border/70 bg-surface-2/60">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
            <span className="eyebrow">{labelize(k)}</span>
          </button>
          {open && (
            <div className="min-w-0 border-t border-border/70 p-3">
              <JsonBlock data={v} level={level + 1} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
