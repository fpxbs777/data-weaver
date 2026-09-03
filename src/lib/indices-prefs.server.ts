import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import path from "node:path";
import { readSession } from "./iol.server";

const storage = createStorage({
  driver: fsDriver({ base: path.resolve(process.cwd(), ".data/indices-prefs") }),
});

export type IndicesPrefs = {
  rows: unknown[];
  headers: Record<string, string>;
  pref: { expanded: boolean; sizeMode: "auto" | "custom"; scale: number; showTipo: boolean };
  updatedAt: string;
};

function userKey(): string | null {
  const s = readSession();
  return s?.user || null;
}

export async function loadIndicesPrefs(): Promise<IndicesPrefs | null> {
  const user = userKey();
  if (!user) return null;
  try {
    const data = await storage.getItem<IndicesPrefs>(user);
    return data ?? null;
  } catch {
    return null;
  }
}

export async function saveIndicesPrefs(prefs: IndicesPrefs): Promise<void> {
  const user = userKey();
  if (!user) throw new Error("SIN_SESION");
  await storage.setItem(user, prefs);
}
