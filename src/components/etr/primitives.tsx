import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/etr-data";

export function Panel({
  title,
  eyebrow,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("panel flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("min-w-0 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Delta({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "num text-sm font-medium",
        value > 0 && "text-gain",
        value < 0 && "text-loss",
        value === 0 && "text-muted-foreground",
        className,
      )}
    >
      {fmtPct(value)}
    </span>
  );
}

export function Stat({
  label,
  value,
  delta,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "panel min-w-0 px-4 py-3",
        emphasis && "border-primary/35 bg-surface-2",
      )}
    >
      <p className="eyebrow truncate">{label}</p>
      <p
        className={cn(
          "num mt-1 truncate text-xl font-semibold sm:text-2xl",
          emphasis && "text-gold",
        )}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {delta !== undefined && <Delta value={delta} />}
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function Bar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "gain" | "loss" | "warn" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full",
          tone === "primary" && "bg-primary",
          tone === "gain" && "bg-gain",
          tone === "loss" && "bg-loss",
          tone === "warn" && "bg-warn",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gain" | "loss" | "warn" | "gold";
}) {
  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px]",
        tone === "neutral" && "border-border text-muted-foreground",
        tone === "gain" && "border-gain/40 text-gain",
        tone === "loss" && "border-loss/40 text-loss",
        tone === "warn" && "border-warn/40 text-warn",
        tone === "gold" && "border-primary/45 text-primary",
      )}
    >
      {children}
    </span>
  );
}
