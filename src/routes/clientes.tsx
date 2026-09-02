import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2, Search, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta, Pill } from "@/components/etr/primitives";
import { Editable, commitNumber } from "@/components/etr/editable";
import { useEtr } from "@/lib/etr-store";
import { iolCartera, iolClientesResumen, iolClienteDetalle, iolOperaciones, iolMovimientos } from "@/lib/iol.functions";
import { fmtARS, fmtNum, type Perfil } from "@/lib/etr-data";

const PERFILES: Perfil[] = ["Conservador", "Moderado", "Agresivo"];

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Cartera de clientes y patrimonio — ETR" },
      { name: "description", content: "Listado de clientes asesorados con patrimonio, buscador IOL y cartera propia primero. Detalle de cuentas, saldos, operaciones y movimientos." },
      { property: "og:title", content: "Clientes — ETR" },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  const { state, totalAUM, updateCliente, addCliente, removeCliente } = useEtr();
  const clientes = [...state.clientes].sort((a, b) => b.patrimonio - a.patrimonio);
  const aum = clientes.reduce((a, c) => a + c.patrimonio, 0);
  const ytdProm = aum ? clientes.reduce((a, c) => a + c.patrimonio * c.ytd, 0) / aum : 0;
  const diaProm = aum ? clientes.reduce((a, c) => a + c.patrimonio * c.varDia, 0) / aum : 0;

  return (
    <AppShell title="Clientes" subtitle="Buscador IOL · cartera propia primero · detalle de cuentas, saldos, operaciones y movimientos · doble clic para editar">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="AUM de clientes" value={fmtARS(aum)} delta={diaProm} emphasis />
        <Stat label="Patrimonio total asesorado" value={fmtARS(totalAUM)} hint="clientes + cartera propia" />
        <Stat label="Clientes activos" value={String(clientes.length)} />
        <Stat label="YTD ponderado" value={`${fmtNum(ytdProm, 1)}%`} delta={ytdProm} />
      </div>

      <CarteraPropiaPanel />
      <IolBuscadorPanel />
      <ManualClientesPanel clientes={clientes} updateCliente={updateCliente} addCliente={addCliente} removeCliente={removeCliente} />
    </AppShell>
  );
}

function CarteraPropiaPanel() {
  const q = useQuery({ queryKey: ["iol-cartera-propia"], queryFn: () => iolCartera(), refetchInterval: 60_000, retry: false });
  const posiciones = q.data?.posiciones ?? [];
  const estado = q.data?.estado;
  const total = posiciones.reduce((a, p) => a + p.valorizado, 0);
  return (
    <Panel className="mt-4" eyebrow="Cartera propia · IOL" title="Tu cartera (asesor) — siempre primera" bodyClassName="space-y-3" action={q.isFetching ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}>
      {q.isError ? (
        <p className="text-sm text-muted-foreground">Conectá IOL para ver tu cartera propia automática.</p>
      ) : posiciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q.isLoading ? "Cargando…" : "Sin posiciones en cartera propia."}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-md border border-border bg-surface-2/40 p-3">
              <p className="eyebrow">Valorizado</p>
              <p className="num text-lg font-semibold">{fmtARS(total)}</p>
              <p className="text-xs text-muted-foreground">{posiciones.length} activos</p>
            </div>
            <div className="rounded-md border border-border bg-surface-2/40 p-3">
              <p className="eyebrow">Cuentas</p>
              {estado?.cuentas.map((c) => (
                <p key={c.numero} className="num text-xs">{c.numero} · {c.moneda} · disp {fmtARS(c.disponible)} · tot {fmtARS(c.total)}</p>
              )) ?? <p className="text-xs text-muted-foreground">—</p>}
            </div>
            <div className="rounded-md border border-border bg-surface-2/40 p-3">
              <p className="eyebrow">Total en pesos</p>
              <p className="num text-lg font-semibold">{fmtARS(estado?.totalEnPesos ?? total)}</p>
              <p className="text-xs text-muted-foreground">actualizado {q.data?.updatedAt ? new Date(q.data.updatedAt).toLocaleTimeString("es-AR") : ""}</p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-4 py-2">Activo</th><th className="px-2 py-2 text-right">Cant.</th><th className="px-2 py-2 text-right">PPC</th><th className="px-2 py-2 text-right">Último</th><th className="px-2 py-2 text-right">Valorizado</th><th className="px-4 py-2 text-right">Día</th></tr></thead>
              <tbody className="divide-y divide-border/70">
                {posiciones.slice(0, 12).map((p) => (
                  <tr key={p.id}><td className="px-4 py-2"><span className="num font-semibold">{p.simbolo}</span><span className="block text-xs text-muted-foreground truncate max-w-40">{p.descripcion} · {p.mercado} · {p.moneda}</span></td><td className="num px-2 py-2 text-right">{fmtNum(p.cantidad, 0)}</td><td className="num px-2 py-2 text-right">{fmtNum(p.ppc)}</td><td className="num px-2 py-2 text-right">{fmtNum(p.ultimoPrecio)}</td><td className="num px-2 py-2 text-right">{fmtARS(p.valorizado)}</td><td className="px-4 py-2 text-right"><Delta value={p.variacionDiaria} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

function IolBuscadorPanel() {
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<number | null>(null);
  const resumen = useQuery({ queryKey: ["iol-clientes-resumen"], queryFn: () => iolClientesResumen(), refetchInterval: 60_000, retry: false });
  const lista = resumen.data ?? [];
  const filtrados = useMemo(() => {
    if (!q) return lista;
    const term = q.toLowerCase();
    return lista.filter((c) => c.nombre.toLowerCase().includes(term) || String(c.id).includes(term) || c.numeroCuenta.toLowerCase().includes(term));
  }, [lista, q]);

  const detalle = useQuery({
    queryKey: ["iol-cliente-detalle", selId],
    queryFn: () => iolClienteDetalle({ data: { id: selId!, nombre: lista.find((c) => c.id === selId)?.nombre ?? "" } }),
    enabled: selId != null,
  });
  const ops = useQuery({ queryKey: ["iol-ops", selId], queryFn: () => iolOperaciones({ data: { id: selId! } }), enabled: selId != null, retry: false });
  const movs = useQuery({ queryKey: ["iol-movs", selId], queryFn: () => iolMovimientos({ data: { id: selId! } }), enabled: selId != null, retry: false });

  const sel = lista.find((c) => c.id === selId);

  return (
    <Panel className="mt-4" eyebrow="IOL · Asesores" title="Buscador de clientes IOL" bodyClassName="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, id o cuenta…" className="w-full rounded-md border border-border bg-surface-2 pl-8 pr-2 py-1.5 text-sm outline-none" />
        </div>
        <span className="text-xs text-muted-foreground self-center">{filtrados.length} / {lista.length}</span>
        {resumen.isFetching && <RefreshCw className="h-4 w-4 animate-spin self-center" />}
      </div>

      {resumen.isError ? <p className="text-sm text-muted-foreground">Conectá IOL para ver clientes.</p> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-md border border-border max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2"><tr className="text-left text-xs text-muted-foreground"><th className="px-3 py-2">Cliente</th><th className="px-2 py-2 text-right">Total $</th></tr></thead>
              <tbody className="divide-y divide-border/70">
                {filtrados.slice(0, 80).map((c) => (
                  <tr key={c.id} onClick={() => setSelId(c.id)} className={`cursor-pointer hover:bg-surface-2/60 ${selId === c.id ? "bg-primary/10" : ""}`}>
                    <td className="px-3 py-2"><span className="font-medium">{c.nombre}</span><span className="block text-xs text-muted-foreground">{c.id} · {c.numeroCuenta || "sin cuenta"}</span></td>
                    <td className="num px-2 py-2 text-right text-xs">{fmtARS(c.totalEnPesos)}<span className="block text-[11px] text-muted-foreground">ARS {fmtNum(c.disponibleARS,0)} · USD {fmtNum(c.disponibleUSD,0)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-2 space-y-3">
            {!sel ? <p className="text-sm text-muted-foreground py-8 text-center">Seleccioná un cliente para ver cuentas, saldos, operaciones y movimientos.</p> : (
              <>
                <div className="rounded-md border border-border p-3">
                  <p className="font-semibold">{sel.nombre} · {sel.id}</p>
                  <p className="text-xs text-muted-foreground">Cuenta {sel.numeroCuenta} · {sel.tipoCuenta}</p>
                </div>
                {detalle.data && (
                  <div className="space-y-2">
                    <p className="eyebrow">Cuentas y saldos</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {detalle.data.estado.cuentas.map((c) => (
                        <div key={c.numero} className="rounded-md border border-border bg-surface-2/40 p-2 text-xs">
                          <p className="font-medium">{c.numero} · {c.tipo} · {c.moneda}</p>
                          <p className="num">Disp {fmtARS(c.disponible)} · Comp {fmtARS(c.comprometido)} · Saldo {fmtARS(c.saldo)}</p>
                          <p className="num text-muted-foreground">Títulos {fmtARS(c.titulosValorizados)} · Total {fmtARS(c.total)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="eyebrow">Posiciones · {detalle.data.posiciones.length} activos · {fmtARS(detalle.data.posiciones.reduce((a,p)=>a+p.valorizado,0))}</p>
                    <div className="overflow-x-auto rounded-md border border-border max-h-60 overflow-auto">
                      <table className="w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="px-2 py-1">Símbolo</th><th className="px-2 py-1 text-right">Cant.</th><th className="px-2 py-1 text-right">Valorizado</th><th className="px-2 py-1 text-right">Día</th></tr></thead>
                        <tbody className="divide-y divide-border/50">{detalle.data.posiciones.slice(0, 20).map((p)=> (<tr key={p.id}><td className="px-2 py-1 num font-medium">{p.simbolo}</td><td className="px-2 py-1 text-right num">{fmtNum(p.cantidad,0)}</td><td className="px-2 py-1 text-right num">{fmtARS(p.valorizado)}</td><td className="px-2 py-1 text-right"><Delta value={p.variacionDiaria} /></td></tr>))}</tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><p className="eyebrow">Operaciones</p>{ops.data ? <div className="rounded-md border border-border p-2 text-xs max-h-40 overflow-auto">{Array.isArray(ops.data) && ops.data.length ? ops.data.slice(0,10).map((o:any,i:number)=>(<p key={i} className="truncate">{JSON.stringify(o).slice(0,120)}</p>)) : <p className="text-muted-foreground">Sin operaciones</p>}</div> : <p className="text-xs text-muted-foreground">{ops.isLoading ? "Cargando…" : "—"}</p>}</div>
                  <div><p className="eyebrow">Movimientos (90d)</p>{movs.data ? <div className="rounded-md border border-border p-2 text-xs max-h-40 overflow-auto"><p className="truncate">{JSON.stringify(movs.data).slice(0,400)}</p></div> : <p className="text-xs text-muted-foreground">{movs.isLoading ? "Cargando…" : "—"}</p>}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function ManualClientesPanel({ clientes, updateCliente, addCliente, removeCliente }: any) {
  return (
    <Panel className="mt-4" eyebrow="Asesoría" title="Clientes manuales (editable)" bodyClassName="p-0" action={<button onClick={addCliente} className="flex items-center gap-1 rounded-md border border-primary/50 px-2 py-1 text-xs text-primary"><Plus className="h-3 w-3" /> Agregar</button>}>
      {clientes.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Todavía no cargaste clientes manuales.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-4 py-2">Cliente</th><th className="px-2 py-2">Perfil</th><th className="px-2 py-2 text-right">Patrimonio</th><th className="px-2 py-2 text-right">Día</th><th className="px-2 py-2 text-right">YTD</th><th className="px-2 py-2 text-right">Desvío</th><th className="px-2 py-2">Última op.</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-border">
              {clientes.map((c: any) => (
                <tr key={c.id} className="hover:bg-surface-2/60">
                  <td className="px-4 py-2"><Editable className="font-medium" value={c.nombre} onCommit={(raw: string) => updateCliente(c.id, { nombre: raw })} /><div className="num text-xs text-muted-foreground">{c.id}</div></td>
                  <td className="px-2 py-2 text-xs"><Editable value={c.perfil} options={PERFILES} display={<Pill>{c.perfil}</Pill>} onCommit={(raw: string) => updateCliente(c.id, { perfil: raw as Perfil })} /></td>
                  <td className="num px-2 py-2 text-right"><Editable align="right" type="number" value={c.patrimonio} display={fmtARS(c.patrimonio)} onCommit={(raw: string) => commitNumber(raw, (n) => updateCliente(c.id, { patrimonio: n }))} /></td>
                  <td className="px-2 py-2 text-right"><Editable align="right" type="number" value={c.varDia} display={<Delta value={c.varDia} />} onCommit={(raw: string) => commitNumber(raw, (n) => updateCliente(c.id, { varDia: n }))} /></td>
                  <td className="px-2 py-2 text-right"><Editable align="right" type="number" value={c.ytd} display={<Delta value={c.ytd} />} onCommit={(raw: string) => commitNumber(raw, (n) => updateCliente(c.id, { ytd: n }))} /></td>
                  <td className="num px-2 py-2 text-right"><Editable align="right" type="number" value={c.drift} display={<span className={c.drift >= 4 ? "text-loss" : "text-muted-foreground"}>{fmtNum(c.drift, 1)} p.p.</span>} onCommit={(raw: string) => commitNumber(raw, (n) => updateCliente(c.id, { drift: n }))} /></td>
                  <td className="num px-2 py-2 text-xs text-muted-foreground"><Editable value={c.ultimaOperacion} onCommit={(raw: string) => updateCliente(c.id, { ultimaOperacion: raw })} /></td>
                  <td className="px-4 py-2 text-right"><button onClick={() => removeCliente(c.id)} className="rounded border border-border p-1 hover:text-loss"><Trash2 className="h-3 w-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
