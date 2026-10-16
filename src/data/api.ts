import type { Carrera, ClaseDraft, NewUser, Profile, Resultado, ResultadoPatch, RosterEntry, Snapshot } from "../lib/types";

export interface Api {
  mode: "demo" | "cloud";
  restore(): Promise<Profile | null>;
  signIn(usuario: string, password: string): Promise<Profile>;
  signOut(): Promise<void>;
  /** Todo lo que el usuario actual tiene permiso de ver */
  load(): Promise<Snapshot>;

  createUser(u: NewUser): Promise<Profile>;
  updateProfile(id: string, patch: Partial<Pick<Profile, "nombre" | "rol" | "decano_id" | "activo">>): Promise<void>;
  setPassword(id: string, password: string): Promise<void>;
  changeMyPassword(password: string): Promise<void>;
  deleteUser(id: string): Promise<void>;

  setClaseDecanos(claseId: string, ids: string[]): Promise<void>;
  setClaseMaestros(claseId: string, ids: string[]): Promise<void>;
  importClase(d: ClaseDraft): Promise<void>;
  /** Sustituye los resultados de una clase existente; conserva nombre, color y accesos */
  replaceResultados(claseId: string, d: Pick<ClaseDraft, "metrics" | "estudiantes" | "archivo">): Promise<void>;
  updateClase(id: string, patch: { nombre?: string; grupo?: string; periodo?: string; color?: string }): Promise<void>;
  deleteClase(id: string): Promise<void>;
  updateResultado(id: string, patch: Partial<Pick<Resultado, "nombre" | "matricula" | "carrera" | "grupo" | "equipo" | "valores">>): Promise<void>;
  /** Guarda en bloque los estudiantes de una clase: crea o modifica (upserts) y quita (deletes) */
  saveResultados(claseId: string, upserts: Resultado[], deletes: string[]): Promise<void>;
  upsertCarreras(list: Carrera[]): Promise<void>;
  /** Guarda un ajuste de la plataforma, como los nombres de roles o competencias (solo administración) */
  setAjuste(clave: string, valor: unknown): Promise<void>;

  loadRoster(): Promise<RosterEntry[]>;
  saveRoster(list: RosterEntry[]): Promise<void>;
  /** Completa datos de resultados ya cargados (matrícula, carrera, grupo, equipo) */
  syncResultados(list: ResultadoPatch[]): Promise<number>;
  /** true si la base de datos aún no tiene las columnas nuevas del directorio (falta 003) */
  directoryLimited?: boolean;
}

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = !!(URL_ && KEY_);

/** Modo nube si hay Supabase configurado (salvo ?demo en la URL); si no, demo local */
export async function createApi(): Promise<Api> {
  const forceDemo = /[?&#]demo\b/.test(location.href) || sessionStorage.getItem("pp_force_demo") === "1";
  if (cloudConfigured && !forceDemo) {
    const { SupabaseApi } = await import("./supabaseApi");
    return new SupabaseApi(URL_!, KEY_!);
  }
  const { DemoApi } = await import("./demoApi");
  return new DemoApi();
}

export function friendlyError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return "Usuario o contraseña incorrectos.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión con el servidor. Revisa tu internet.";
  if (/row-level security|permission denied/i.test(m)) return "No tienes permiso para hacer esto.";
  return m;
}
