import { createServerFn } from "@tanstack/react-start";
import { loadIndicesPrefs, saveIndicesPrefs, type IndicesPrefs } from "./indices-prefs.server";

export type { IndicesPrefs };

export const getIndicesPrefs = createServerFn({ method: "GET" })
  .handler(async (): Promise<IndicesPrefs | null> => loadIndicesPrefs());

export const saveIndicesPrefsFn = createServerFn({ method: "POST" })
  .validator((input: { rows: unknown[]; headers: Record<string, string>; pref: IndicesPrefs["pref"] }) => {
    if (!input || !Array.isArray(input.rows)) throw new Error("rows inválido");
    return {
      rows: input.rows.slice(0, 20),
      headers: input.headers ?? {},
      pref: input.pref ?? { expanded: true, sizeMode: "auto" as const, scale: 1, showTipo: true },
    };
  })
  .handler(async ({ data }) => saveIndicesPrefs({ ...data, updatedAt: new Date().toISOString() }));
