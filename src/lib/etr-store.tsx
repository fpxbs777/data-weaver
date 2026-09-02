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
import { getQuotes, getMercado, getProfiles, type MercadoSnapshot, type Quote } from "@/lib/market.functions";
import {
  ponderado,
  sumResultado,
  sumValuado,
  valuado,
  type Alerta,
  type Client,
  type CustomColumn,
  type Holding,
  type MarketOverride,
  type ModelRow,
  type Position,
} from "@/lib/etr-data";
import { iolCartera } from "@/lib/iol.functions";
import type { IolPos } from "@/lib/iol-model";

const STORAGE_KEY = "etr-terminal-state-v1";

export type EtrState = {
  positions: Position[];
  overrides: Record<string, MarketOverride>;
  /** Overrides para posiciones que vienen de IOL (editadas con doble clic) */
  iolOverrides: Record<string, Partial<Position>>;
  modelo: ModelRow[];
  clientes: Client[];
  mercadoOverrides: Record<string, { label?: string; value?: number; changePct?: number }>;
  macroOverrides: Record<string, { label?: string; value?: string; detail?: string }>;
  /** Columnas custom propias del asesor */
  customColumns: CustomColumn[];
  hiddenColumns: string[];
  columnOrder: string[];
  /** Si la cartera IOL se mezcla automáticamente con la manual */
  iolAuto: boolean;
  umbral: number;
};

const emptyState: EtrState = {
  positions: [],
  overrides: {},
  iolOverrides: {},
  modelo: [],
  clientes: [],
  mercadoOverrides: {},
  macroOverrides: {},
  customColumns: [],
  hiddenColumns: [],
  columnOrder: [],
  iolAuto: true,
  umbral: 1.5,
};

type Ctx = {
  state: EtrState;
  hydrated: boolean;
  holdings: Holding[];
  holdingsManual: Holding[];
  holdingsIol: Holding[];
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
  profiles: Record<string, { sector: string; industria: string; tipo: string; moneda: string; mercado: string }>;
  loadingQuotes: boolean;
  loadingMercado: boolean;
  loadingIol: boolean;
  iolCartera: IolPos[] | undefined;
  refetchAll: () => void;
  pesoReal: (ticker: string) => number;
  updatePosition: (ticker: string, patch: Partial<Position>) => void;
  updateOverride: (ticker: string, patch: MarketOverride) => void;
  clearOverride: (ticker: string, field: keyof MarketOverride) => void;
  addPosition: () => void;
  removePosition: (ticker: string) => void;
  addColumn: (col: CustomColumn) => void;
  removeColumn: (id: string) => void;
  toggleColumn: (id: string) => void;
  moveColumn: (id: string, dir: 1 | -1) => void;
  setIolAuto: (v: boolean) => void;
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
    return {
      ...emptyState,
      ...parsed,
      customColumns: (parsed as any).customColumns ?? [],
      hiddenColumns: (parsed as any).hiddenColumns ?? [],
      columnOrder: (parsed as any).columnOrder ?? [],
      iolOverrides: (parsed as any).iolOverrides ?? {},
      iolAuto: (parsed as any).iolAuto ?? true,
    };
  } catch {
    return emptyState;
  }
}

function iolPosToPosition(p: IolPos): Position {
  const clase = p.tipo.toLowerCase().includes("fci") || p.tipo.toLowerCase().includes("caucion") ? "Liquidez" : p.tipo.toLowerCase().includes("bono") || p.tipo.toLowerCase().includes("letra") || p.tipo.toLowerCase().includes("oblig") ? "Renta fija" : p.tipo === "CEDEAR" ? "CEDEAR" : "Renta variable";
  return {
    ticker: p.simbolo,
    name: p.descripcion || p.simbolo,
    clase: clase as Position["clase"],
    mercado: (p.mercado as Position["mercado"]) || "BCBA",
    symbol: p.yahoo || p.simbolo,
    simbolo: p.simbolo,
    cantidad: p.cantidad,
    ppc: p.ppc,
    moneda: p.moneda,
    categoria: p.tipo,
    tipoInstrumento: undefined,
    fuenteClasificacion: "iol",
  };
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

  // IOL cartera propia (automatica)
  const iolQuery = useQuery({
    queryKey: ["iol-cartera-auto"],
    queryFn: () => iolCartera(),
    enabled: hydrated && state.iolAuto,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });

  const symbols = useMemo(
    () => [...new Set([...state.positions.map((p) => p.symbol).filter(Boolean), ...(iolQuery.data?.posiciones.map((p) => p.yahoo).filter(Boolean) ?? [])])],
    [state.positions, iolQuery.data],
  );

  const quotesQuery = useQuery({
    queryKey: ["quotes", symbols.sort().join("|")],
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

  const profilesQuery = useQuery({
    queryKey: ["profiles", symbols.sort().join("|")],
    queryFn: () => getProfiles({ data: { symbols } }),
    enabled: hydrated && symbols.length > 0,
    staleTime: 300_000,
  });

  const profilesMap = useMemo(() => {
    const m: Record<string, { sector: string; industria: string; tipo: string; moneda: string; mercado: string }> = {};
    for (const p of profilesQuery.data ?? []) m[p.symbol] = { sector: p.sector, industria: p.industria, tipo: p.tipo, moneda: p.moneda, mercado: p.mercado };
    return m;
  }, [profilesQuery.data]);

  const quotes = quotesQuery.data ?? [];

  // Holdings manuales (como antes)
  const holdingsManual: Holding[] = useMemo(() => {
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    return state.positions.map((p) => {
      const q = bySymbol.get(p.symbol);
      const ov = state.overrides[p.ticker] ?? {};
      const precio = ov.precio ?? (q?.ok ? q.price : undefined);
      const varDia = ov.varDia ?? (q?.ok ? q.varDia : undefined);
      const ytd = ov.ytd ?? (q?.ok ? q.ytd : undefined);
      const manual = ov.precio !== undefined || ov.varDia !== undefined || ov.ytd !== undefined;
      const prof = profilesMap[p.symbol];
      return {
        ...p,
        sector: p.sector || prof?.sector,
        industria: p.industria || prof?.industria,
        precio: precio ?? 0,
        varDia: varDia ?? 0,
        ytd: ytd ?? 0,
        fuente: manual ? "manual" : q?.ok ? "real" : "sin dato",
      };
    });
  }, [state.positions, state.overrides, quotes, profilesMap]);

  // Holdings IOL convertidos
  const holdingsIol: Holding[] = useMemo(() => {
    if (!state.iolAuto || !iolQuery.data) return [];
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    return iolQuery.data.posiciones.map((pos) => {
      const base = iolPosToPosition(pos);
      const ovPos = state.iolOverrides[pos.id] ?? {};
      const merged: Position = { ...base, ...ovPos, ticker: ovPos.ticker ?? base.ticker };
      const q = bySymbol.get(merged.symbol);
      const ov = state.overrides[merged.ticker] ?? {};
      // IOL ya trae ultimoPrecio/variacion, usar como fallback si no hay quote
      const precio = ov.precio ?? (q?.ok ? q.price : pos.ultimoPrecio);
      const varDia = ov.varDia ?? (q?.ok ? q.varDia : pos.variacionDiaria);
      const prof = profilesMap[merged.symbol];
      return {
        ...merged,
        sector: merged.sector || prof?.sector,
        industria: merged.industria || prof?.industria,
        cantidad: merged.cantidad,
        ppc: merged.ppc,
        precio: precio ?? 0,
        varDia: varDia ?? 0,
        ytd: ov.ytd ?? (q?.ok ? q.ytd : 0),
        fuente: ov.precio !== undefined ? "manual" : q?.ok || pos.ultimoPrecio ? "real" : "sin dato",
      } as Holding;
    });
  }, [iolQuery.data, state.iolAuto, state.iolOverrides, state.overrides, quotes, profilesMap]);

  // Holdings unificados: IOL + manuales, dedupe por ticker
  const holdings: Holding[] = useMemo(() => {
    if (!state.iolAuto) return holdingsManual;
    const map = new Map<string, Holding>();
    for (const h of holdingsIol) map.set(h.ticker, h);
    for (const h of holdingsManual) {
      // si el manual coincide con uno de IOL, el manual gana (edición del asesor)
      map.set(h.ticker, h);
    }
    return [...map.values()];
  }, [holdingsIol, holdingsManual, state.iolAuto]);

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
      holdingsManual,
      holdingsIol,
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
      profiles: profilesMap,
      loadingQuotes: quotesQuery.isFetching,
      loadingMercado: mercadoQuery.isFetching,
      loadingIol: iolQuery.isFetching,
      iolCartera: iolQuery.data?.posiciones,
      refetchAll: () => {
        void quotesQuery.refetch();
        void mercadoQuery.refetch();
        void iolQuery.refetch();
        void profilesQuery.refetch();
      },
      pesoReal,
      updatePosition: (ticker, patch) =>
        patchState((s) => {
          const isManual = s.positions.some((p) => p.ticker === ticker);
          if (isManual) {
            return { ...s, positions: s.positions.map((p) => (p.ticker === ticker ? { ...p, ...patch } : p)) };
          }
          // Si no es manual, es una posición IOL: guardar en iolOverrides por ticker
          const iolPos = holdingsIol.find((h) => h.ticker === ticker);
          if (iolPos) {
            const id = iolQuery.data?.posiciones.find((p) => p.simbolo === ticker)?.id ?? ticker;
            return { ...s, iolOverrides: { ...s.iolOverrides, [id]: { ...s.iolOverrides[id], ...patch } } };
          }
          return { ...s, positions: s.positions.map((p) => (p.ticker === ticker ? { ...p, ...patch } : p)) };
        }),
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
        patchState((s) => {
          // si es IOL, borrar override en lugar de la posicion base
          const iolEntry = Object.entries(s.iolOverrides).find(([, v]) => (v as any).ticker === ticker);
          if (iolEntry) {
            const next = { ...s.iolOverrides };
            delete next[iolEntry[0]];
            return { ...s, iolOverrides: next };
          }
          return { ...s, positions: s.positions.filter((p) => p.ticker !== ticker) };
        }),
      addColumn: (col) =>
        patchState((s) => ({
          ...s,
          customColumns: s.customColumns.some((c) => c.id === col.id) ? s.customColumns : [...s.customColumns, col],
          columnOrder: s.columnOrder.includes(col.id) ? s.columnOrder : [...s.columnOrder, col.id],
        })),
      removeColumn: (id) =>
        patchState((s) => ({
          ...s,
          hiddenColumns: s.hiddenColumns.includes(id) ? s.hiddenColumns : [...s.hiddenColumns, id],
        })),
      toggleColumn: (id) =>
        patchState((s) => ({
          ...s,
          hiddenColumns: s.hiddenColumns.includes(id) ? s.hiddenColumns.filter((x) => x !== id) : [...s.hiddenColumns, id],
        })),
      moveColumn: (id, dir) =>
        patchState((s) => {
          const order = s.columnOrder.length ? [...s.columnOrder] : s.customColumns.map((c) => c.id);
          const i = order.indexOf(id);
          const j = i + dir;
          if (i === -1 || j < 0 || j >= order.length) return s;
          const tmp = order[i]!;
          order[i] = order[j]!;
          order[j] = tmp;
          return { ...s, columnOrder: order };
        }),
      setIolAuto: (v) => patchState((s) => ({ ...s, iolAuto: v })),
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
    holdingsManual,
    holdingsIol,
    totalCartera,
    totalResultado,
    varDiaCartera,
    ytdCartera,
    liquidez,
    totalAUM,
    mercadoRows,
    alertas,
    quotes,
    profilesMap,
    mercadoQuery,
    quotesQuery,
    iolQuery,
    profilesQuery,
    pesoReal,
  ]);

  return <EtrContext.Provider value={api}>{children}</EtrContext.Provider>;
}

export function useEtr() {
  const ctx = useContext(EtrContext);
  if (!ctx) throw new Error("useEtr debe usarse dentro de <EtrProvider>");
  return ctx;
}
