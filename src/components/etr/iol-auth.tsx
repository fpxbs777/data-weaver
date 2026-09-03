import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { LogIn, Loader2, ShieldCheck } from "lucide-react";
import { iolLogin, iolLogout, iolSession, type IolSessionInfo } from "@/lib/iol.functions";
const logo = { url: "/favicon.png" };

type Ctx = { session: IolSessionInfo; loading: boolean; logout: () => void };
const IolCtx = createContext<Ctx>({ session: null, loading: true, logout: () => {} });

export const useIol = () => useContext(IolCtx);

export const iolSessionKey = ["iol", "session"] as const;

function LoginScreen() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: (v: { username: string; password: string }) => iolLogin({ data: v }),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <main className="relative grid min-h-screen place-items-center px-4 py-10">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.79_0.13_85/0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(50%_40%_at_80%_100%,oklch(0.79_0.13_85/0.08),transparent)]" />
      </div>

      <section className="panel w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <img src={logo.url} alt="Logo ETR" className="h-20 w-20 object-contain" />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-[0.2em]">ETR</h1>
          <p className="eyebrow mt-1">Terminal de asesores CNV</p>
        </div>

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate({ username, password });
          }}
        >
          <div>
            <label className="eyebrow" htmlFor="iol-user">
              Usuario IOL
            </label>
            <input
              id="iol-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="num mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
          </div>
          <div>
            <label className="eyebrow" htmlFor="iol-pass">
              Contraseña
            </label>
            <input
              id="iol-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="num mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
          </div>

          {login.isError && (
            <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
              {(login.error as Error).message}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/60 bg-primary/15 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-60"
          >
            {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Ingresar con InvertirOnline
          </button>
        </form>

        <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Las credenciales se envían directo a api.invertironline.com desde el servidor de la
          terminal. El token queda en una cookie httpOnly; nunca se guarda tu contraseña.
        </p>
      </section>
    </main>
  );
}

export function IolGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: iolSessionKey, queryFn: () => iolSession(), staleTime: 60_000 });

  const logout = () => {
    void iolLogout().then(() => qc.invalidateQueries());
  };

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!q.data) return <LoginScreen />;

  return (
    <IolCtx.Provider value={{ session: q.data, loading: q.isFetching, logout }}>
      {children}
    </IolCtx.Provider>
  );
}
