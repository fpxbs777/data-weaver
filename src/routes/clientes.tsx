import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/etr/app-shell";
import { Panel, Stat, Delta, Pill } from "@/components/etr/primitives";
import { Editable, commitNumber } from "@/components/etr/editable";
import { useEtr } from "@/lib/etr-store";
import { fmtARS, fmtNum, type Perfil } from "@/lib/etr-data";

const PERFILES: Perfil[] = ["Conservador", "Moderado", "Agresivo"];

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Cartera de clientes y patrimonio — ETR Terminal" },
      {
        name: "description",
        content:
          "Listado de clientes asesorados con patrimonio, perfil de riesgo, rendimiento y desvío frente al modelo ETR.",
      },
      { property: "og:title", content: "Clientes — ETR Terminal" },
      {
        property: "og:description",
        content: "Patrimonio por cliente, perfil, variación diaria, YTD y desvío del modelo.",
      },
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
    <AppShell title="Clientes" subtitle="Doble clic en cualquier celda para editar · Enter para guardar">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="AUM de clientes" value={fmtARS(aum)} delta={diaProm} emphasis />
        <Stat label="Patrimonio total asesorado" value={fmtARS(totalAUM)} hint="clientes + cartera propia" />
        <Stat label="Clientes activos" value={String(clientes.length)} />
        <Stat label="YTD ponderado" value={`${fmtNum(ytdProm, 1)}%`} delta={ytdProm} />
      </div>

      <Panel
        className="mt-4"
        eyebrow="Asesoría"
        title="Cartera de clientes"
        bodyClassName="p-0"
        action={
          <button
            type="button"
            onClick={addCliente}
            className="flex items-center gap-1 rounded-md border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary/10"
          >
            <Plus className="h-3 w-3" /> Agregar cliente
          </button>
        }
      >
        {clientes.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Todavía no cargaste clientes. Usá «Agregar cliente» para empezar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-2 py-2 font-medium">Perfil</th>
                  <th className="px-2 py-2 text-right font-medium">Patrimonio</th>
                  <th className="px-2 py-2 text-right font-medium">Día</th>
                  <th className="px-2 py-2 text-right font-medium">YTD</th>
                  <th className="px-2 py-2 text-right font-medium">Desvío</th>
                  <th className="px-2 py-2 font-medium">Última operación</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clientes.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <td className="px-4 py-2">
                      <Editable
                        className="font-medium"
                        value={c.nombre}
                        onCommit={(raw) => updateCliente(c.id, { nombre: raw })}
                      />
                      <div className="num text-xs text-muted-foreground">{c.id}</div>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <Editable
                        value={c.perfil}
                        options={PERFILES}
                        display={<Pill>{c.perfil}</Pill>}
                        onCommit={(raw) => updateCliente(c.id, { perfil: raw as Perfil })}
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={c.patrimonio}
                        display={fmtARS(c.patrimonio)}
                        onCommit={(raw) => commitNumber(raw, (n) => updateCliente(c.id, { patrimonio: n }))}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={c.varDia}
                        display={<Delta value={c.varDia} />}
                        onCommit={(raw) => commitNumber(raw, (n) => updateCliente(c.id, { varDia: n }))}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={c.ytd}
                        display={<Delta value={c.ytd} />}
                        onCommit={(raw) => commitNumber(raw, (n) => updateCliente(c.id, { ytd: n }))}
                      />
                    </td>
                    <td className="num px-2 py-2 text-right">
                      <Editable
                        align="right"
                        type="number"
                        value={c.drift}
                        display={<span className={c.drift >= 4 ? "text-loss" : "text-muted-foreground"}>{fmtNum(c.drift, 1)} p.p.</span>}
                        onCommit={(raw) => commitNumber(raw, (n) => updateCliente(c.id, { drift: n }))}
                      />
                    </td>
                    <td className="num px-2 py-2 text-xs text-muted-foreground">
                      <Editable
                        value={c.ultimaOperacion}
                        onCommit={(raw) => updateCliente(c.id, { ultimaOperacion: raw })}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        title="Eliminar cliente"
                        onClick={() => removeCliente(c.id)}
                        className="rounded border border-border p-1 text-muted-foreground hover:text-loss"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
