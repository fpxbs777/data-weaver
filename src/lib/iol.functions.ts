import { createServerFn } from "@tanstack/react-start";
import {
  iolFetch,
  listClientes,
  loginIol,
  readSession,
  writeSession,
  type IolCliente,
  type Json,
} from "./iol.server";

export type IolSessionInfo = { user: string } | null;

export const iolLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => ({
    username: String(input?.username ?? "").trim(),
    password: String(input?.password ?? ""),
  }))
  .handler(async ({ data }): Promise<IolSessionInfo> => {
    if (!data.username || !data.password) throw new Error("Ingresá usuario y contraseña.");
    const s = await loginIol(data.username, data.password);
    return { user: s.user || data.username };
  });

export const iolLogout = createServerFn({ method: "POST" }).handler(async (): Promise<null> => {
  writeSession(null);
  return null;
});

export const iolSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<IolSessionInfo> => {
    const s = readSession();
    return s ? { user: s.user } : null;
  },
);

export const iolClientes = createServerFn({ method: "GET" }).handler(
  async (): Promise<IolCliente[]> => listClientes(),
);

export const iolPerfil = createServerFn({ method: "GET" }).handler(async (): Promise<Json> =>
  iolFetch<Json>("/api/v2/datos-perfil"),
);

export const iolEstadoCuenta = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }): Promise<Json> =>
    iolFetch<Json>(`/api/v2/Asesores/EstadoDeCuenta/${data.id}`),
  );

export const iolPortafolio = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; pais?: string }) => ({
    id: Number(input?.id),
    pais: input?.pais === "Estados_Unidos" ? "Estados_Unidos" : "Argentina",
  }))
  .handler(async ({ data }): Promise<Json> =>
    iolFetch<Json>(`/api/v2/Asesores/Portafolio/${data.id}/${data.pais}`),
  );

export const iolOperaciones = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; estado?: string; pais?: string; desde?: string; hasta?: string }) => ({
    id: Number(input?.id),
    estado: input?.estado ?? "Todas",
    pais: input?.pais ?? "Argentina",
    desde: input?.desde,
    hasta: input?.hasta,
  }))
  .handler(async ({ data }): Promise<Json[]> => {
    const res = await iolFetch<Json>("/api/v2/Asesores/Operaciones", {
      query: {
        IdClienteAsesorado: data.id,
        Estado: data.estado,
        Pais: data.pais,
        FechaDesde: data.desde,
        FechaHasta: data.hasta,
      },
    });
    return Array.isArray(res) ? (res as Json[]) : [];
  });

export const iolDetalleOperacion = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; numero: number }) => ({
    id: Number(input?.id),
    numero: Number(input?.numero),
  }))
  .handler(async ({ data }): Promise<Json> =>
    iolFetch<Json>(`/api/v2/Asesores/Operaciones/Detalle/${data.id}/${data.numero}`),
  );

export const iolMovimientos = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; desde?: string; hasta?: string }) => ({
    id: Number(input?.id),
    desde: input?.desde,
    hasta: input?.hasta,
  }))
  .handler(async ({ data }): Promise<Json> => {
    const to = data.hasta ? new Date(data.hasta) : new Date();
    const from = data.desde ? new Date(data.desde) : new Date(to.getTime() - 90 * 86400000);
    return iolFetch<Json>("/api/v2/Asesor/Movimientos", {
      method: "POST",
      body: {
        clientes: [data.id],
        from: from.toISOString(),
        to: to.toISOString(),
        dateType: "fechaOperacion",
        status: "",
        type: "",
        country: "argentina",
        currency: "",
        cuentaComitente: "",
      },
    });
  });

// ---------- Automatización: datos normalizados ----------

import {
  clienteEstado,
  clientePortafolio,
  clientesNormalizados,
  ownEstado,
  ownPortafolio,
} from "./iol.server";
import type { ClienteIol, IolEstado, IolPos } from "./iol-model";

export type CarteraIol = { posiciones: IolPos[]; estado: IolEstado; updatedAt: string };

/** Cartera propia del asesor (siempre el primer "cliente" de la lista). */
export const iolCartera = createServerFn({ method: "GET" }).handler(async (): Promise<CarteraIol> => {
  const [posiciones, estado] = await Promise.all([ownPortafolio(), ownEstado()]);
  return { posiciones, estado, updatedAt: new Date().toISOString() };
});

export type ClienteResumen = ClienteIol & {
  totalEnPesos: number;
  disponibleARS: number;
  disponibleUSD: number;
  titulos: number;
};

/** Lista de clientes con su estado de cuenta resuelto en paralelo. */
export const iolClientesResumen = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClienteResumen[]> => {
    const clientes = await clientesNormalizados();
    const acotados = clientes.slice(0, 60);
    const estados = await Promise.all(
      acotados.map((c) => clienteEstado(c.id).catch(() => ({ cuentas: [], totalEnPesos: 0 }) as IolEstado)),
    );
    return acotados.map((c, i) => {
      const e = estados[i]!;
      const suma = (m: "ARS" | "USD") =>
        e.cuentas.filter((x) => x.moneda === m).reduce((a, x) => a + x.disponible, 0);
      return {
        ...c,
        totalEnPesos: e.totalEnPesos,
        disponibleARS: suma("ARS"),
        disponibleUSD: suma("USD"),
        titulos: e.cuentas.reduce((a, x) => a + x.titulosValorizados, 0),
      };
    });
  },
);

export const iolClienteDetalle = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; nombre?: string }) => ({
    id: Number(input?.id),
    nombre: String(input?.nombre ?? ""),
  }))
  .handler(async ({ data }): Promise<{ posiciones: IolPos[]; estado: IolEstado }> => {
    const [posiciones, estado] = await Promise.all([
      clientePortafolio(data.id, data.nombre || `Cliente ${data.id}`),
      clienteEstado(data.id),
    ]);
    return { posiciones, estado };
  });
