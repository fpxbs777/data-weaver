import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getQuotes, getMercado, type MercadoSnapshot, type Quote } from "@/lib/market.functions";
import {
  ponderado,
  sumResultado,
  sumValuado,
  valuado,
  type Alerta,
  type Client,
  type Holding,
  type MarketOverride,
  type ModelRow,
  type Position,
} from "@/lib/etr-data";

const STORAGE_KEY = "etr-terminal-state-v1";

export type EtrState = {
  positions: Position[];
  overrides: Record<string, MarketOverride>;
  modelo: ModelRow[];
  clientes: Client[];
  /** Overrides del asesor sobre filas de mercado (índices, dólares) y macro. */
  mercadoOverrides: Record<string, { label?: string; value?: number; changePct?: number }>;
  macroOverrides: Record<string, { label?: string; value?: string; detail?: string }>;
  umbral: number;
};

const emptyState: EtrState = {
  positions: [],
  overrides: {},
  modelo: [],
  clientes: [],
  mercadoOverrides: {},
  macroOverrides: {},
  umbral: 1.5,
};

type Ctx = {
  state: EtrState;
  hydrated: boolean;
  holdings: Holding[];
  totalCartera: number;
  totalResultado: number;
  varDiaCartera: number;
  ytdCartera: number;
  liquidez: number;
  totalAUM: number;
  mercado: MercadoSnapshot | undefined;
  mercadoRows: { indices: MercadoRow[]; divisas: MercadoRow[]; macro: MacroRow[] };
  alertas: Alerta[];
  quotes: Quote[];
  loadingQuotes: boolean;
  loadingMercado: boolean;
  refetchAll: () => void;
  pesoReal: (ticker: string) => number;
  updatePosition: (ticker: string, patch: Partial<Position>) => void;
  updateOverride: (ticker: string, patch: MarketOverride) => void;
  clearOverride: (ticker: string, field: keyof MarketOverride) => void;
  addPosition: () => void;
  removePosition: (ticker: string) => void;
  updateModelo: (ticker: string, patch: Partial<ModelRow>) => void;
  addModelo: () => void;
  removeModelo: (ticker: string) => void;
  updateCliente: (id: string, patch: Partial<Client>) => void;
  addCliente: () => void;
  removeCliente: (id: string) => void;
  updateMercadoRow: (symbol: string, patch: { label?: string; value?: number; changePct?: number }) => void;
  updateMacroRow: (label: string, patch: { label?: string; value?: string; detail?: string }) => void;
  setUmbral: (v: number) => void;
  resetAll: () => void;
};

export type MercadoRow = {
  label: string;
  symbol: string;
  value: number;
  changePct: number;
  unit: "ARS" | "USD" | "pts" | "bps";
  editado: boolean;
};

export type MacroRow = { key: string; label: string; value: string; detail: string; editado: boolean };

const EtrContext = createContext<Ctx | null>(null);

function load(): EtrState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as Partial<EtrState>;
    return { ...emptyState, ...parsed };
  } catch {
    return emptyState;
  }
}

export function EtrProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EtrState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    setState(load());
    loaded.current = true;
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [state]);

  const symbols = useMemo(
    () => [...new Set(state.positions.map((p) => p.symbol).filter(Boolean))],
    [state.positions],
  );

  const quotesQuery = useQuery({
    queryKey: ["quotes", symbols],
    queryFn: () => getQuotes({ data: { symbols } }),
    enabled: hydrated && symbols.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const mercadoQuery = useQuery({
    queryKey: ["mercado"],
    queryFn: () => getMercado(),
    enabled: hydrated,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const quotes = quotesQuery.data ?? [];

  const holdings: Holding[] = useMemo(() => {
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    return state.positions.map((p) => {
      const q = bySymbol.get(p.symbol);
      const ov = state.overrides[p.ticker] ?? {};
      const precio = ov.precio ?? (q?.ok ? q.price : undefined);
      const varDia = ov.varDia ?? (q?.ok ? q.varDia : undefined);
      const ytd = ov.ytd ?? (q?.ok ? q.ytd : undefined);
      const manual = ov.precio !== undefined || ov.varDia !== undefined || ov.ytd !== undefined;
      return {
        ...p,
        precio: precio ?? 0,
        varDia: varDia ?? 0,
        ytd: ytd ?? 0,
        fuente: manual ? "manual" : q?.ok ? "real" : "sin dato",
      };
    });
  }, [state.positions, state.overrides, quotes]);

  const totalCartera = sumValuado(holdings);
  const totalResultado = sumResultado(holdings);
  const varDiaCartera = ponderado(holdings, "varDia");
  const ytdCartera = ponderado(holdings, "ytd");
  const liquidez = sumValuado(holdings.filter((h) => h.clase === "Liquidez"));
  const totalAUM = state.clientes.reduce((a, c) => a + c.patrimonio, 0) + totalCartera;

  const pesoReal = useCallback(
    (ticker: string) => {
      const h = holdings.find((x) => x.ticker === ticker);
      return h && totalCartera ? (valuado(h) / totalCartera) * 100 : 0;
    },
    [holdings, totalCartera],
  );

  const mercadoRows = useMemo(() => {
    const apply = (rows: MercadoSnapshot["indices"]): MercadoRow[] =>
      rows.map((r) => {
        const ov = state.mercadoOverrides[r.symbol] ?? {};
        return {
          label: ov.label ?? r.label,
          symbol: r.symbol,
          value: ov.value ?? r.value,
          changePct: ov.changePct ?? r.changePct,
          unit: r.unit,
          editado: ov.value !== undefined || ov.changePct !== undefined || ov.label !== undefined,
        };
      });
    const macro: MacroRow[] = (mercadoQuery.data?.macro ?? []).map((m) => {
      const ov = state.macroOverrides[m.label] ?? {};
      return {
        key: m.label,
        label: ov.label ?? m.label,
        value: ov.value ?? m.value,
        detail: ov.detail ?? m.detail,
        editado: ov.value !== undefined || ov.detail !== undefined || ov.label !== undefined,
      };
    });
    return {
      indices: apply(mercadoQuery.data?.indices ?? []),
      divisas: apply(mercadoQuery.data?.divisas ?? []),
      macro,
    };
  }, [mercadoQuery.data, state.mercadoOverrides, state.macroOverrides]);

  const alertas: Alerta[] = useMemo(() => {
    const out: Alerta[] = [];
    const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    for (const m of state.modelo) {
      const drift = pesoReal(m.ticker) - m.target;
      if (Math.abs(drift) >= state.umbral * 2) {
        out.push({
          id: `drift-${m.ticker}`,
          nivel: Math.abs(drift) >= state.umbral * 4 ? "critico" : "atencion",
          titulo: `Desvío de ${m.ticker}: ${drift.toFixed(1)} p.p.`,
          detalle: `Peso real ${pesoReal(m.ticker).toFixed(1)}% vs objetivo ${m.target}% del modelo ETR.`,
          hora,
        });
      }
    }
    for (const c of state.clientes) {
      if (Math.abs(c.drift) >= state.umbral * 4) {
        out.push({
          id: `cli-${c.id}`,
          nivel: "critico",
          titulo: `Desvío alto en ${c.nombre}`,
          detalle: `Desvío declarado de ${c.drift.toFixed(1)} p.p. frente al modelo ETR.`,
          hora,
        });
      }
    }
    const sinDato = holdings.filter((h) => h.fuente === "sin dato");
    if (sinDato.length) {
      out.push({
        id: "sin-dato",
        nivel: "atencion",
        titulo: `${sinDato.length} posición(es) sin cotización en línea`,
        detalle: `Revisá el símbolo de ${sinDato.map((h) => h.ticker).join(", ")} o cargá el precio a mano.`,
        hora,
      });
    }
    return out.slice(0, 8);
  }, [state.modelo, state.clientes, state.umbral, holdings, pesoReal]);

  const api = useMemo<Ctx>(() => {
    const patchState = (fn: (s: EtrState) => EtrState) => setState((s) => fn(s));
    return {
      state,
      hydrated,
      holdings,
      totalCartera,
      totalResultado,
      varDiaCartera,
      ytdCartera,
      liquidez,
      totalAUM,
      mercado: mercadoQuery.data,
      mercadoRows,
      alertas,
      quotes,
      loadingQuotes: quotesQuery.isFetching,
      loadingMercado: mercadoQuery.isFetching,
      refetchAll: () => {
        void quotesQuery.refetch();
        void mercadoQuery.refetch();
      },
      pesoReal,
      updatePosition: (ticker, patch) =>
        patchState((s) => ({
          ...s,
          positions: s.positions.map((p) => (p.ticker === ticker ? { ...p, ...patch } : p)),
        })),
      updateOverride: (ticker, patch) =>
        patchState((s) => ({
          ...s,
          overrides: { ...s.overrides, [ticker]: { ...s.overrides[ticker], ...patch } },
        })),
      clearOverride: (ticker, field) =>
        patchState((s) => {
          const next = { ...s.overrides[ticker] };
          delete next[field];
          return { ...s, overrides: { ...s.overrides, [ticker]: next } };
        }),
      addPosition: () =>
        patchState((s) => {
          const n = s.positions.length + 1;
          const ticker = `NUEVO${n}`;
          return {
            ...s,
            positions: [
              ...s.positions,
              {
                ticker,
                name: "Nueva posición",
                clase: "Renta variable",
                mercado: "BCBA",
                symbol: "",
                cantidad: 0,
                ppc: 0,
              },
            ],
          };
        }),
      removePosition: (ticker) =>
        patchState((s) => ({ ...s, positions: s.positions.filter((p) => p.ticker !== ticker) })),
      updateModelo: (ticker, patch) =>
        patchState((s) => ({
          ...s,
          modelo: s.modelo.map((m) => (m.ticker === ticker ? { ...m, ...patch } : m)),
        })),
      addModelo: () =>
        patchState((s) => ({
          ...s,
          modelo: [...s.modelo, { ticker: `NUEVO${s.modelo.length + 1}`, clase: "Renta variable", target: 0 }],
        })),
      removeModelo: (ticker) =>
        patchState((s) => ({ ...s, modelo: s.modelo.filter((m) => m.ticker !== ticker) })),
      updateCliente: (id, patch) =>
        patchState((s) => ({
          ...s,
          clientes: s.clientes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      addCliente: () =>
        patchState((s) => {
          const id = `C-${1000 + s.clientes.length + 1}`;
          return {
            ...s,
            clientes: [
              ...s.clientes,
              {
                id,
                nombre: "Nuevo cliente",
                perfil: "Moderado",
                patrimonio: 0,
                varDia: 0,
                ytd: 0,
                drift: 0,
                ultimaOperacion: new Date().toLocaleDateString("es-AR"),
              },
            ],
          };
        }),
      removeCliente: (id) => patchState((s) => ({ ...s, clientes: s.clientes.filter((c) => c.id !== id) })),
      updateMercadoRow: (symbol, patch) =>
        patchState((s) => ({
          ...s,
          mercadoOverrides: { ...s.mercadoOverrides, [symbol]: { ...s.mercadoOverrides[symbol], ...patch } },
        })),
      updateMacroRow: (label, patch) =>
        patchState((s) => ({
          ...s,
          macroOverrides: { ...s.macroOverrides, [label]: { ...s.macroOverrides[label], ...patch } },
        })),
      setUmbral: (v) => patchState((s) => ({ ...s, umbral: v })),
      resetAll: () => setState(emptyState),
    };
  }, [
    state,
    hydrated,
    holdings,
    totalCartera,
    totalResultado,
    varDiaCartera,
    ytdCartera,
    liquidez,
    totalAUM,
    mercadoRows,
    alertas,
    quotes,
    pesoReal,
    mercadoQuery,
    quotesQuery,
  ]);

  return <EtrContext.Provider value={api}>{children}</EtrContext.Provider>;
}

export function useEtr() {
  const ctx = useContext(EtrContext);
  if (!ctx) throw new Error("useEtr debe usarse dentro de <EtrProvider>");
  return ctx;
}
