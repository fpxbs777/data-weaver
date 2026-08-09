import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CandlestickChart,
  Wallet,
  LineChart,
  Target,
  Users,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import logo from "@/assets/etr-logo.png.asset.json";
import bgImage from "@/assets/finance-bg.jpg";
import { fmtNum, fmtPct } from "@/lib/etr-data";
import { useEtr } from "@/lib/etr-store";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  kbd: string;
};

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Tablero",
    items: [
      { to: "/", label: "Resumen", icon: LayoutDashboard, kbd: "R" },
      { to: "/mercado", label: "Mercado & Macro", icon: CandlestickChart, kbd: "M" },
    ],
  },
  {
    label: "Cartera propia",
    items: [
      { to: "/cartera", label: "Tenencias", icon: Wallet, kbd: "C" },
      { to: "/historico", label: "Histórico & YTD", icon: LineChart, kbd: "H" },
    ],
  },
  {
    label: "Asesoría",
    items: [
      { to: "/modelo", label: "Modelo & Convergencia", icon: Target, kbd: "O" },
      { to: "/clientes", label: "Clientes", icon: Users, kbd: "L" },
    ],
  },
  {
    label: "Sistema",
    items: [{ to: "/configuracion", label: "Configuración", icon: Settings, kbd: "," }],
  },
];

function Ticker() {
  const { mercadoRows } = useEtr();
  const items = [...mercadoRows.indices, ...mercadoRows.divisas];
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Sincronizando cotizaciones en vivo…</p>;
  }
  const doubled = [...items, ...items];
  return (
    <div className="relative min-w-0 overflow-hidden">
      <div className="marquee flex w-max gap-6">
        {doubled.map((t, i) => (
          <span key={`${t.symbol}-${i}`} className="flex shrink-0 items-center gap-2 text-xs">
            <b className="font-semibold text-foreground/80">{t.label}</b>
            <span className="num text-muted-foreground">{fmtNum(t.value, t.unit === "bps" ? 0 : 2)}</span>
            <span className={cn("num", t.changePct >= 0 ? "text-gain" : "text-loss")}>
              {fmtPct(t.changePct)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="num text-xs text-muted-foreground">
      {now
        ? now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "--:--:--"}
    </span>
  );
}

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { alertas, mercado, loadingMercado, refetchAll } = useEtr();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
        <div className="absolute inset-0 bg-background/85" />
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,transparent,var(--background))]" />
      </div>

      <div className="flex min-h-screen">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl transition-[width] duration-200 lg:flex",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <div className="flex items-center gap-3 px-4 py-5">
            <img src={logo.url} alt="Logo ETR" className="h-9 w-9 shrink-0 object-contain" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold tracking-widest">ETR</p>
                <p className="truncate text-[11px] text-muted-foreground">Terminal de asesores</p>
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {NAV.map((group) => (
              <div key={group.label}>
                {!collapsed && <p className="eyebrow px-2 pb-2">{group.label}</p>}
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.to;
                    const Icon = item.icon;
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to as never}
                          title={item.label}
                          className={cn(
                            "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--sidebar-primary)]"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-3 py-3">
            {!collapsed && <Clock />}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 lg:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <img src={logo.url} alt="Logo ETR" className="h-8 w-8 shrink-0 object-contain lg:hidden" />
                <div className="min-w-0">
                  <h1 className="truncate font-display text-lg font-semibold sm:text-xl">{title}</h1>
                  {subtitle && (
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCmdOpen(true)}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Buscar vista o ticker</span>
                  <kbd className="num hidden rounded border border-border px-1 text-[10px] sm:inline">⌘K</kbd>
                </button>
                <span className="relative rounded-md border border-border bg-surface p-1.5">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {alertas.length}
                  </span>
                </span>
              </div>
            </div>
            <div className="border-t border-border px-4 py-2 lg:px-6">
              <Ticker />
            </div>
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-background/50 px-3 py-2 lg:hidden">
            {NAV.flatMap((g) => g.items).map((item) => (
              <Link
                key={item.to}
                to={item.to as never}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-xs",
                  pathname === item.to
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</main>

          <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground lg:px-6">
            ETR Terminal · datos de demostración · última sincronización 17:03
          </footer>
        </div>
      </div>

      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <CommandInput placeholder="Ir a una vista…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          {NAV.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`${group.label} ${item.label}`}
                  onSelect={() => {
                    setCmdOpen(false);
                    navigate({ to: item.to as never });
                  }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </div>
  );
}
