import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Minus, RefreshCw, Search, Maximize2, Minimize2, SlidersHorizontal, Settings2 } from "lucide-react";
import { Panel } from "@/components/etr/primitives";
import { getIndicesArsUsd, searchTickersFn, type IndiceArsUsdRow } from "@/lib/indices-arsusd.functions";
import { getIndicesPrefs, saveIndicesPrefsFn, type IndicesPrefs } from "@/lib/indices-prefs.functions";

type RowCfg = { id: string; nombre: string; ticker: string; mercado: string; arsOverride?: number | null; varArsOverride?: number | null; usdOverride?: number | null; varUsdOverride?: number | null; tipoOverride?: string | null };

const STORAGE_KEY = "etr-indices-arsusd-v1";
const PREF_KEY = "etr-indices-arsusd-pref-v1";
const HEADER_KEY = "etr-indices-arsusd-headers-v1";
const MERCADOS = ["BCBA", "NYSE", "NASDAQ", "INDEX"] as const;

const DEFAULT_HEADERS = { nombre: "Nombre", ticker: "Ticker", ars: "ARS", usd: "USD" };

type Pref = { expanded: boolean; sizeMode: "auto" | "custom"; scale: number; showTipo: boolean };

function loadPref(): Pref {
  const def: Pref = { expanded: true, sizeMode: "auto", scale: 1, showTipo: true };
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<Pref>;
    return {
      expanded: p.expanded ?? true,
      sizeMode: p.sizeMode === "custom" ? "custom" : "auto",
      scale: typeof p.scale === "number" ? Math.min(1.5, Math.max(0.7, p.scale)) : 1,
      showTipo: p.showTipo ?? true,
    };
  } catch { return def; }
}

function loadHeaders(): typeof DEFAULT_HEADERS {
  if (typeof window === "undefined") return DEFAULT_HEADERS;
  try {
    const raw = window.localStorage.getItem(HEADER_KEY);
    if (!raw) return DEFAULT_HEADERS;
    const p = JSON.parse(raw) as Partial<typeof DEFAULT_HEADERS>;
    return { ...DEFAULT_HEADERS, ...p };
  } catch { return DEFAULT_HEADERS; }
}

function loadRows(): RowCfg[] {
  if (typeof window === "undefined") return [{ id: "1", nombre: "Merval", ticker: "^MERV", mercado: "INDEX" }];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [{ id: "1", nombre: "Merval", ticker: "^MERV", mercado: "INDEX" }];
    const parsed = JSON.parse(raw) as RowCfg[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [{ id: "1", nombre: "Merval", ticker: "^MERV", mercado: "INDEX" }];
    return parsed.slice(0, 20).map((r: any, i: number) => ({
      id: String(r.id ?? i + 1),
      nombre: String(r.nombre ?? r.ticker ?? "").slice(0, 30) || String(r.ticker ?? "").toUpperCase(),
      ticker: String(r.ticker ?? "").toUpperCase().slice(0, 20),
      mercado: String(r.mercado ?? "BCBA").toUpperCase().slice(0, 10),
      arsOverride: r.arsOverride ?? null,
      varArsOverride: r.varArsOverride ?? null,
      usdOverride: r.usdOverride ?? null,
      varUsdOverride: r.varUsdOverride ?? null,
      tipoOverride: r.tipoOverride ?? null,
    })).filter((r) => r.ticker);
  } catch { return [{ id: "1", nombre: "Merval", ticker: "^MERV", mercado: "INDEX" }]; }
}

function fmtNum(v: number | null, d = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}
function fmtPrice(v: number | null, moneda: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (moneda === "ARS") return `$ ${fmtNum(v, 2)}`;
  if (moneda === "USD") return `US$ ${fmtNum(v, 2)}`;
  return fmtNum(v, 2);
}
function fmtPct(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${fmtNum(v, 2)}%`;
}

type EditCell = { id: string; col: "nombre" | "ticker" | "tipo" | "ars" | "varArs" | "usd" | "varUsd" } | null;

export function IndicesArsUsdWidget() {
  const [rows, setRows] = useState<RowCfg[]>(() => loadRows());
  const [headers, setHeaders] = useState(() => loadHeaders());
  const [editingHeader, setEditingHeader] = useState<keyof typeof DEFAULT_HEADERS | null>(null);
  const [draftHeader, setDraftHeader] = useState("");
  const [editCell, setEditCell] = useState<EditCell>(null);
  const [draftValue, setDraftValue] = useState("");
  const [draftMercado, setDraftMercado] = useState<string>("BCBA");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pref, setPref] = useState<Pref>(() => loadPref());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showConfig, setShowConfig] = useState(false);
  const serverLoaded = useRef(false);

  // --- Server persistence ---
  const serverPrefsQ = useQuery({
    queryKey: ["indices-prefs"],
    queryFn: () => getIndicesPrefs(),
    staleTime: Infinity,
    retry: false,
  });

  // When server prefs arrive, override local state (once)
  useEffect(() => {
    if (serverLoaded.current || !serverPrefsQ.data) return;
    const sp = serverPrefsQ.data as IndicesPrefs;
    if (sp?.rows?.length) {
      const parsed = sp.rows.map((r: any, i: number) => ({
        id: String(r.id ?? i + 1),
        nombre: String(r.nombre ?? r.ticker ?? "").slice(0, 30) || String(r.ticker ?? "").toUpperCase(),
        ticker: String(r.ticker ?? "").toUpperCase().slice(0, 20),
        mercado: String(r.mercado ?? "BCBA").toUpperCase().slice(0, 10),
        arsOverride: r.arsOverride ?? null,
        varArsOverride: r.varArsOverride ?? null,
        usdOverride: r.usdOverride ?? null,
        varUsdOverride: r.varUsdOverride ?? null,
        tipoOverride: r.tipoOverride ?? null,
      })).filter((r: RowCfg) => r.ticker);
      if (parsed.length > 0) setRows(parsed);
    }
    if (sp?.headers && typeof sp.headers === "object") {
      setHeaders((h) => ({ ...h, ...sp.headers }));
    }
    if (sp?.pref) {
      setPref((p) => ({
        expanded: sp.pref.expanded ?? true,
        sizeMode: sp.pref.sizeMode === "custom" ? "custom" : "auto",
        scale: typeof sp.pref.scale === "number" ? Math.min(1.5, Math.max(0.7, sp.pref.scale)) : 1,
        showTipo: sp.pref.showTipo ?? true,
      }));
    }
    serverLoaded.current = true;
  }, [serverPrefsQ.data]);

  const saveServerMut = useMutation({
    mutationFn: (payload: { rows: unknown[]; headers: Record<string, string>; pref: IndicesPrefs["pref"] }) =>
      saveIndicesPrefsFn({ data: payload }),
    onError: () => {},
  });

  // Debounced server save (800ms after last change)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!serverLoaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveServerMut.mutate({ rows, headers, pref });
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [rows, headers, pref]);

  // --- LocalStorage fallback (always kept in sync) ---
  useEffect(() => { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {} }, [rows]);
  useEffect(() => { try { window.localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch {} }, [pref]);
  useEffect(() => { try { window.localStorage.setItem(HEADER_KEY, JSON.stringify(headers)); } catch {} }, [headers]);

  const q = useQuery({
    queryKey: ["indices-arsusd", rows.map((r) => `${r.ticker}:${r.mercado}`).join("|")],
    queryFn: () => getIndicesArsUsd({ data: { items: rows.map((r) => ({ ticker: r.ticker, mercado: r.mercado })) } }),
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: rows.length > 0,
  });

  const map = useMemo(() => {
    const m = new Map<string, IndiceArsUsdRow>();
    for (const r of q.data ?? []) m.set(`${r.inputTicker}:${r.inputMercado}`, r);
    return m;
  }, [q.data]);

  const searchQ = useQuery({
    queryKey: ["ticker-search", draftValue, draftMercado],
    queryFn: () => searchTickersFn({ data: { q: draftValue, mercado: draftMercado } }),
    enabled: showDropdown && editCell?.col === "ticker" && draftValue.trim().length >= 1,
    staleTime: 60_000,
  });

  const startAdd = () => {
    const id = String(Date.now());
    setRows((prev) => [...prev, { id, nombre: "Nuevo", ticker: "", mercado: "BCBA" }]);
    setEditCell({ id, col: "ticker" });
    setDraftValue("");
    setDraftMercado("BCBA");
    setShowDropdown(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (editCell?.id === id) { setEditCell(null); setShowDropdown(false); }
  };

  const commitCell = () => {
    if (!editCell) return;
    const { id, col } = editCell;
    const v = draftValue.trim();
    if (col === "nombre") {
      if (!v) { setEditCell(null); return; }
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, nombre: v.slice(0, 30) } : r));
    } else if (col === "tipo") {
      if (!v) { setEditCell(null); return; }
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, tipoOverride: v.slice(0, 20) } : r));
    } else if (col === "ticker") {
      const t = v.toUpperCase();
      if (!t) {
        const row = rows.find((r) => r.id === id);
        if (row && !row.ticker) setRows((prev) => prev.filter((r) => r.id !== id));
        setEditCell(null); setShowDropdown(false); return;
      }
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, ticker: t, nombre: r.nombre === "Nuevo" || !r.nombre ? t : r.nombre, mercado: draftMercado || r.mercado } : r));
    } else if (col === "ars") {
      const n = Number(v.replace(",", "."));
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, arsOverride: Number.isFinite(n) ? n : null } : r));
    } else if (col === "varArs") {
      const n = Number(v.replace(",", "."));
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, varArsOverride: Number.isFinite(n) ? n : null } : r));
    } else if (col === "usd") {
      const n = Number(v.replace(",", "."));
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, usdOverride: Number.isFinite(n) ? n : null } : r));
    } else if (col === "varUsd") {
      const n = Number(v.replace(",", "."));
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, varUsdOverride: Number.isFinite(n) ? n : null } : r));
    }
    setEditCell(null);
    setShowDropdown(false);
  };

  const cancelCell = () => { setEditCell(null); setShowDropdown(false); };

  const openEdit = (id: string, col: EditCell["col"], current: string | number | null) => {
    setEditCell({ id, col });
    if (col === "ticker" || col === "nombre" || col === "tipo") { setDraftValue(String(current ?? "")); setDraftMercado(rows.find((r) => r.id === id)?.mercado ?? "BCBA"); setShowDropdown(col === "ticker"); }
    else { setDraftValue(current != null ? String(current) : ""); }
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const scaleStyle = pref.sizeMode === "auto" ? { fontSize: `${pref.scale * 100}%` } : undefined;

  return (
    <div
      ref={wrapperRef}
      className={pref.sizeMode === "custom" ? "resize overflow-auto rounded-lg border border-transparent hover:border-border/50 min-h-[220px] min-w-[320px] max-h-[80vh] max-w-full" : "w-full"}
      style={pref.sizeMode === "custom" ? { resize: "both" as const, overflow: "auto" } : undefined}
    >
    <Panel eyebrow="Indices" title="Mini Dataframe — ARS vs USD" bodyClassName="p-0"
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button type="button" onClick={() => setPref((p) => ({ ...p, sizeMode: "auto" }))} className={`rounded px-1.5 py-0.5 text-[11px] ${pref.sizeMode === "auto" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Auto</button>
            <button type="button" onClick={() => setPref((p) => ({ ...p, sizeMode: "custom" }))} className={`rounded px-1.5 py-0.5 text-[11px] ${pref.sizeMode === "custom" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><SlidersHorizontal className="h-3 w-3 inline mr-1" />Custom</button>
          </div>
          {pref.sizeMode === "auto" && (<input type="range" min={0.7} max={1.5} step={0.05} value={pref.scale} onChange={(e) => setPref((p) => ({ ...p, scale: Number(e.target.value) }))} className="hidden sm:block h-1 w-16 accent-primary" title={`Escala ${Math.round(pref.scale * 100)}%`} />)}
          <div className="relative">
            <button type="button" onClick={() => setShowConfig((v) => !v)} className="inline-flex items-center rounded-md border border-border p-1 hover:bg-surface-2" title="Configuración dataframe">
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            {showConfig && (
              <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-border bg-card p-2 shadow-lg">
                <p className="mb-2 text-xs font-medium">Configuración</p>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={pref.showTipo} onChange={(e) => setPref((p) => ({ ...p, showTipo: e.target.checked }))} className="rounded" />
                  Mostrar tipo debajo del ticker
                </label>
                <p className="mt-1 text-[11px] text-muted-foreground">Ej: Índice, ETF, Cedear</p>
                <button type="button" onClick={() => setShowConfig(false)} className="mt-2 w-full rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Cerrar</button>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setPref((p) => ({ ...p, expanded: !p.expanded }))} className="inline-flex items-center rounded-md border border-border p-1 hover:bg-surface-2" title={pref.expanded ? "Achicar" : "Expandir"}>
            {pref.expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => void q.refetch()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2">
            <RefreshCw className={`h-3 w-3 ${q.isFetching ? "animate-spin" : ""}`} /> Actualizar
          </button>
          <button type="button" onClick={startAdd} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3 w-3" /> Añadir
          </button>
        </div>
      }
    >
      {!pref.expanded ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">Minimizado — {rows.length} índice(s) · <button type="button" onClick={() => setPref((p) => ({ ...p, expanded: true }))} className="text-primary hover:underline">Expandir</button></div>
      ) : (
      <div className="overflow-x-auto" style={scaleStyle}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-2/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              {(["nombre", "ticker", "ars", "usd"] as const).map((k) => (
                <th key={k} onDoubleClick={() => { setEditingHeader(k as any); setDraftHeader((headers as any)[k]); }} className={`px-3 py-2 font-medium cursor-pointer hover:text-foreground ${k === "ars" || k === "usd" ? "text-right" : ""} ${k === "nombre" ? "min-w-[120px]" : ""}`} title="Doble click para editar nombre de columna">
                  {editingHeader === k ? (
                    <input autoFocus value={draftHeader} onChange={(e) => setDraftHeader(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setHeaders((h) => ({ ...h, [k]: draftHeader.trim() || (DEFAULT_HEADERS as any)[k] })); setEditingHeader(null); } if (e.key === "Escape") setEditingHeader(null); }} onBlur={() => { setHeaders((h) => ({ ...h, [k]: draftHeader.trim() || (DEFAULT_HEADERS as any)[k] })); setEditingHeader(null); }} className="w-full rounded border border-primary bg-card px-1 py-0.5 text-xs" />
                  ) : ( (headers as any)[k] )}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium w-10">—</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row) => {
              const data = map.get(`${row.ticker}:${row.mercado}`);
              const loading = q.isLoading && !data;
              const arsPrice = row.arsOverride ?? data?.ars.price ?? null;
              const varArs = row.varArsOverride ?? data?.ars.varDia ?? null;
              const usdPrice = row.usdOverride ?? data?.usd.price ?? null;
              const varUsd = row.varUsdOverride ?? data?.usd.varDia ?? null;
              const tipo = row.tipoOverride ?? data?.tipo ?? "—";
              const descripcion = data?.descripcion ?? "";
              const isManualArs = row.arsOverride != null;
              const isManualUsd = row.usdOverride != null;

              // fila vacía sin ticker
              if (!row.ticker && editCell?.id !== row.id) {
                return (
                  <tr key={row.id} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2" onDoubleClick={() => openEdit(row.id, "nombre", row.nombre)}><span className="text-xs font-medium cursor-pointer hover:text-primary hover:underline" onDoubleClick={() => openEdit(row.id, "nombre", row.nombre)}>{row.nombre}</span></td>
                    <td className="px-3 py-2" colSpan={2} onDoubleClick={() => { setEditCell({id: row.id, col:"ticker"}); setDraftValue(""); setShowDropdown(true); setTimeout(()=>inputRef.current?.focus(),30); }}><span className="text-xs text-primary cursor-pointer hover:underline">Doble click para configurar ticker · Mercado se elige antes de Enter</span></td>
                    <td className="px-2 py-2 text-center"><button type="button" onClick={() => removeRow(row.id)} className="inline-flex rounded p-1 text-muted-foreground hover:bg-loss/10 hover:text-loss"><Minus className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              }

              // modo edición ticker: muestra input + selector mercado en la celda ticker
              const isEditingTicker = editCell?.id === row.id && editCell.col === "ticker";

              return (
                <tr key={row.id} className="hover:bg-surface-2/40">
                  <td className="px-3 py-2">
                    {editCell?.id === row.id && editCell.col === "nombre" ? (
                      <input ref={inputRef} autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") cancelCell(); }} onBlur={commitCell} className="w-full rounded-md border border-primary bg-card px-2 py-1 text-xs outline-none" />
                    ) : (
                      <span onDoubleClick={() => openEdit(row.id, "nombre", row.nombre)} className="cursor-pointer hover:text-primary hover:underline decoration-dotted text-xs font-medium" title="Doble click para editar, Enter para guardar">{row.nombre}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {isEditingTicker ? (
                      <span className="relative inline-flex flex-col gap-1">
                        <span className="flex items-center gap-1">
                          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                          <input ref={inputRef} value={draftValue} onChange={(e) => { setDraftValue(e.target.value.toUpperCase()); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onKeyDown={(e) => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") cancelCell(); }} placeholder="^MERV, SPY" className="w-24 rounded-md border border-primary bg-card px-2 py-1 text-xs font-mono outline-none" autoComplete="off" />
                        </span>
                        <select value={draftMercado} onChange={(e) => setDraftMercado(e.target.value)} className="rounded-md border border-border bg-card px-1 py-0.5 text-[11px]">
                          {MERCADOS.map((m) => (<option key={m} value={m}>{m}</option>))}
                        </select>
                        <span className="text-[10px] text-muted-foreground">Mercado solo para traer datos</span>
                        {showDropdown && (
                          <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-64 overflow-auto rounded-md border border-border bg-card shadow-lg">
                            {(searchQ.data ?? []).length === 0 ? (
                              <p className="px-3 py-2 text-xs text-muted-foreground">{searchQ.isFetching ? "Buscando…" : draftValue ? "Sin coincidencias — Enter para usar tal cual" : "Escribí un ticker"}</p>
                            ) : (
                              (searchQ.data ?? []).map((it) => (
                                <button key={`${it.ticker}-${it.mercado}`} type="button" onClick={() => { setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ticker: it.ticker, mercado: it.mercado, nombre: r.nombre === "Nuevo" || !r.nombre ? it.nombre || it.ticker : r.nombre } : r)); setEditCell(null); setShowDropdown(false); }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-surface-2">
                                  <span className="font-mono text-xs font-medium">{it.ticker}</span>
                                  <span className="truncate text-[11px] text-muted-foreground">{it.mercado} · {it.nombre}</span>
                                </button>
                              ))
                            )}
                            <div className="border-t border-border p-1 flex gap-1">
                              <button type="button" onClick={commitCell} className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Guardar (Enter)</button>
                              <button type="button" onClick={cancelCell} className="flex-1 rounded border border-border px-2 py-1 text-xs">Cancelar</button>
                            </div>
                          </div>
                        )}
                      </span>
                    ) : (
                      <span onDoubleClick={() => openEdit(row.id, "ticker", row.ticker)} className="cursor-pointer hover:text-primary hover:underline decoration-dotted inline-flex flex-col" title="Doble click para editar ticker, Mercado se elige antes de Enter">
                        <span className="font-semibold">{row.ticker || "—"}</span>
                        {pref.showTipo && (
                          editCell?.id === row.id && editCell.col === "tipo" ? (
                            <input ref={inputRef} autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") cancelCell(); }} onBlur={commitCell} className="mt-1 w-full rounded-md border border-primary bg-card px-1 py-0.5 text-[11px] outline-none" />
                          ) : (
                            <span onDoubleClick={(e) => { e.stopPropagation(); openEdit(row.id, "tipo", tipo); }} className="mt-0.5 text-[11px] text-muted-foreground hover:text-primary truncate max-w-[140px]" title="Doble click para editar tipo">{tipo}{descripcion && tipo !== descripcion ? ` · ${descripcion}` : ""}</span>
                          )
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editCell?.id === row.id && (editCell.col === "ars" || editCell.col === "varArs") ? (
                      <input ref={inputRef} autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") cancelCell(); }} onBlur={commitCell} placeholder={editCell.col==="ars"?"Precio ARS":"% var"} className="w-20 rounded-md border border-primary bg-card px-2 py-1 text-xs text-right outline-none" />
                    ) : (
                      <span onDoubleClick={() => openEdit(row.id, "ars", row.arsOverride ?? arsPrice)} className={`cursor-pointer hover:underline decoration-dotted inline-flex flex-col items-end ${isManualArs ? "text-primary" : ""}`} title={data?.error ? `${data.error} · Doble click para editar ARS` : "Doble click para editar ARS"}>
                        {loading ? <span className="text-muted-foreground">…</span> : (
                          <>
                            <span className="font-mono text-xs">{fmtPrice(arsPrice, "ARS")}{data?.ars.sintetico && !isManualArs ? " *" : ""}{isManualArs ? " ✎" : ""}</span>
                            <span className={`text-[11px] font-medium ${varArs != null ? (varArs > 0 ? "text-gain" : varArs < 0 ? "text-loss" : "text-muted-foreground") : "text-muted-foreground"}`}>{varArs != null ? `${varArs > 0 ? "▲ " : varArs < 0 ? "▼ " : ""}${fmtPct(varArs)}` : "—"}</span>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editCell?.id === row.id && (editCell.col === "usd" || editCell.col === "varUsd") ? (
                      <input ref={inputRef} autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") cancelCell(); }} onBlur={commitCell} placeholder={editCell.col==="usd"?"Precio USD":"% var"} className="w-20 rounded-md border border-primary bg-card px-2 py-1 text-xs text-right outline-none" />
                    ) : (
                      <span onDoubleClick={() => openEdit(row.id, "usd", row.usdOverride ?? usdPrice)} className={`cursor-pointer hover:underline decoration-dotted inline-flex flex-col items-end ${isManualUsd ? "text-primary" : ""}`} title={data?.error ? `${data.error} · Doble click para editar USD` : "Doble click para editar USD"}>
                        {loading ? <span className="text-muted-foreground">…</span> : (
                          <>
                            <span className="font-mono text-xs">{fmtPrice(usdPrice, "USD")}{data?.usd.sintetico && !isManualUsd ? " *" : ""}{isManualUsd ? " ✎" : ""}</span>
                            <span className={`text-[11px] font-medium ${varUsd != null ? (varUsd > 0 ? "text-gain" : varUsd < 0 ? "text-loss" : "text-muted-foreground") : "text-muted-foreground"}`}>{varUsd != null ? `${varUsd > 0 ? "▲ " : varUsd < 0 ? "▼ " : ""}${fmtPct(varUsd)}` : "—"}</span>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button type="button" onClick={() => removeRow(row.id)} className="inline-flex rounded p-1 text-muted-foreground hover:bg-loss/10 hover:text-loss" title="Quitar"><Minus className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">Sin índices. Usá <b>+ Añadir</b> para agregar ^MERV, SPY, etc.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      {(() => {
        if (!pref.expanded) return null;
        const failed = rows
          .map((r) => map.get(`${r.ticker}:${r.mercado}`))
          .filter((d): d is IndiceArsUsdRow => !!d && !d.ok && !!(d.error || q.error));
        const qErr = q.error ? (q.error instanceof Error ? q.error.message : String(q.error)).slice(0, 160) : null;
        if (failed.length === 0 && !qErr) return null;
        const cause = qErr ?? failed[0]!.error ?? "Sin datos";
        const when = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
        return (
          <div className="border-t border-loss/30 bg-loss/5 px-3 py-2 text-[11px] text-loss" title={failed.length > 1 ? failed.map((d) => `${d.inputTicker}: ${d.error}`).join("\n") : undefined}>
            ⚠ {failed.length > 1 ? `${failed.length} filas sin datos · ` : ""}{cause}{when ? ` · último intento ${when}` : ""}{q.isFetching ? " · reintentando…" : ""}
            {failed.length > 1 ? " (pasá el mouse para ver todas)" : ""}
          </div>
        );
      })()}
      {pref.sizeMode === "custom" && pref.expanded && <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground text-right">↘ Arrastrá la esquina inferior derecha para redimensionar (custom)</div>}
    </Panel>
    </div>
  );
}
