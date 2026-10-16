import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Api } from "./api";
import { createApi, friendlyError } from "./api";
import type { Clase, Profile, Snapshot } from "../lib/types";
import { SIN_CARRERA, SIN_GRUPO, generalIndex, normText, unionMetrics, type Row } from "../lib/metrics";
import { setMetricNames, setRoleNames, type RoleNames } from "../lib/labels";

interface Ctx {
  api: Api;
  user: Profile | null;
  snap: Snapshot;
  ready: boolean;
  loading: boolean;
  rows: Row[];
  rowsByClase: Map<string, Row[]>;
  metrics: string[];
  setUser(u: Profile | null): void;
  refresh(): Promise<void>;
  /** Ejecuta una acción, muestra error/éxito y recarga los datos */
  run<T>(fn: (api: Api) => Promise<T>, ok?: string): Promise<T | true | false>;
  carreraName(code: string): string;
  person(id: string | null | undefined): Profile | undefined;
  maestrosOf(c: Clase): Profile[];
  toast(msg: string, kind?: "ok" | "error"): void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("sin AppProvider"); return c; };

const EMPTY: Snapshot = { profiles: [], clases: [], resultados: [], carreras: [], ajustes: {} };
export interface ToastItem { id: number; msg: string; kind: "ok" | "error"; }

export function AppProvider({ children, onToasts }: { children: ReactNode; onToasts: (t: ToastItem[]) => void }) {
  const [api, setApi] = useState<Api | null>(null);
  const [user, setUserState] = useState<Profile | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const toasts = useRef<ToastItem[]>([]);

  const toast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    const t = { id: Date.now() + Math.random(), msg, kind };
    toasts.current = [...toasts.current, t].slice(-4);
    onToasts(toasts.current);
    setTimeout(() => { toasts.current = toasts.current.filter((x) => x !== t); onToasts(toasts.current); }, kind === "error" ? 6500 : 3600);
  }, [onToasts]);

  useEffect(() => {
    (async () => {
      const a = await createApi();
      setApi(a);
      const u = await a.restore().catch(() => null);
      setUserState(u);
      if (u) { try { setSnap(await a.load()); } catch (e) { toast(friendlyError(e), "error"); } }
      setReady(true);
    })();
  }, [toast]);

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try { setSnap(await api.load()); } catch (e) { toast(friendlyError(e), "error"); } finally { setLoading(false); }
  }, [api, toast]);

  const setUser = useCallback((u: Profile | null) => {
    setUserState(u);
    setSnap(EMPTY);
    if (u && api) { setLoading(true); api.load().then(setSnap).catch((e) => toast(friendlyError(e), "error")).finally(() => setLoading(false)); }
  }, [api, toast]);

  const run = useCallback(async <T,>(fn: (api: Api) => Promise<T>, ok?: string) => {
    if (!api) return false;
    try {
      const res = await fn(api);
      if (ok) toast(ok);
      await refresh();
      return res ?? true;
    } catch (e) { toast(friendlyError(e), "error"); return false; }
  }, [api, refresh, toast]);

  const derived = useMemo(() => {
    // nombres visibles configurados por administración (se aplican antes de dibujar)
    setRoleNames(snap.ajustes.roles as Partial<RoleNames> | undefined);
    setMetricNames(snap.ajustes.competencias);
    const carreraMap = new Map(snap.carreras.map((c) => [c.codigo, c.nombre]));
    const carreraName = (code: string) => (code ? carreraMap.get(code) || code : SIN_CARRERA);
    const clsMap = new Map(snap.clases.map((c) => [c.id, c]));
    const rows: Row[] = [];
    const rowsByClase = new Map<string, Row[]>();
    for (const r of snap.resultados) {
      const cls = clsMap.get(r.clase_id); if (!cls) continue;
      const row: Row = { r, cls, indice: generalIndex(cls.metrics, r.valores), carrera: carreraName(r.carrera),
        grupo: r.grupo || cls.grupo || SIN_GRUPO, equipo: r.equipo || "",
        q: normText(r.nombre + " " + r.matricula + " " + r.grupo + " " + (r.equipo ?? "") + " " + cls.nombre) };
      rows.push(row);
      if (!rowsByClase.has(cls.id)) rowsByClase.set(cls.id, []);
      rowsByClase.get(cls.id)!.push(row);
    }
    const people = new Map(snap.profiles.map((p) => [p.id, p]));
    return {
      rows, rowsByClase, carreraName, metrics: unionMetrics(snap.clases),
      person: (id: string | null | undefined) => (id ? people.get(id) : undefined),
      maestrosOf: (c: Clase) => c.maestros.map((m) => people.get(m)).filter((p): p is Profile => !!p),
    };
  }, [snap]);

  if (!api) return null;
  return (
    <AppCtx.Provider value={{ api, user, snap, ready, loading, setUser, refresh, run, toast, ...derived }}>
      {children}
    </AppCtx.Provider>
  );
}

/** Estado de UI recordado por usuario (filtros, vistas) */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const k = "pp_pref_" + key;
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : initial; } catch { return initial; } });
  const set = useCallback((nv: T) => { setV(nv); try { localStorage.setItem(k, JSON.stringify(nv)); } catch { /* */ } }, [k]);
  return [v, set];
}
