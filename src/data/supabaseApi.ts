import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Api } from "./api";
import type { Carrera, Clase, ClaseDraft, NewUser, Profile, Resultado, RosterEntry, Snapshot } from "../lib/types";

// Nombre de la Edge Function de cuentas en Supabase (ver supabase/functions/manage-users)
const USERS_FN = "clever-action";
const toEmail = (u: string) => (u.includes("@") ? u : `${u}@pp.local`).trim().toLowerCase();

export class SupabaseApi implements Api {
  mode = "cloud" as const;
  private sb: SupabaseClient;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "pp_auth" } });
  }

  private async profile(id: string): Promise<Profile> {
    const { data, error } = await this.sb.from("profiles").select("*").eq("id", id).single();
    if (error) throw error;
    if (!data.activo) { await this.sb.auth.signOut(); throw new Error("Tu usuario está desactivado. Contacta a administración."); }
    return data as Profile;
  }
  async restore() {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    try { return await this.profile(data.session.user.id); } catch { return null; }
  }
  async signIn(usuario: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: toEmail(usuario), password });
    if (error) throw error;
    return this.profile(data.user.id);
  }
  async signOut() { await this.sb.auth.signOut(); }

  /** PostgREST devuelve como máximo 1000 filas por petición: se pide por páginas */
  private async all<T>(table: string, select = "*"): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from(table).select(select).range(from, from + 999);
      if (error) throw error;
      out.push(...(data as T[]));
      if (!data || data.length < 1000) return out;
    }
  }
  async load(): Promise<Snapshot> {
    const [profiles, clasesRaw, resultados, carreras, cd, cm] = await Promise.all([
      this.all<Profile>("profiles"),
      this.all<Omit<Clase, "decanos" | "maestros">>("clases"),
      this.all<Resultado>("resultados"),
      this.all<Carrera>("carreras"),
      this.all<{ clase_id: string; decano_id: string }>("clase_decanos", "clase_id,decano_id"),
      this.all<{ clase_id: string; maestro_id: string }>("clase_maestros", "clase_id,maestro_id"),
    ]);
    const clases: Clase[] = clasesRaw.map((c) => ({
      ...c,
      decanos: cd.filter((x) => x.clase_id === c.id).map((x) => x.decano_id),
      maestros: cm.filter((x) => x.clase_id === c.id).map((x) => x.maestro_id),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
    return { profiles, clases, resultados, carreras };
  }

  private async fn(body: Record<string, unknown>) {
    const { data, error } = await this.sb.functions.invoke(USERS_FN, { body });
    if (error) {
      let msg = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  async createUser(u: NewUser) { return (await this.fn({ action: "create", ...u })).profile as Profile; }
  async setPassword(id: string, password: string) { await this.fn({ action: "set_password", id, password }); }
  async deleteUser(id: string) { await this.fn({ action: "delete", id }); }
  async changeMyPassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error;
  }
  async updateProfile(id: string, patch: Partial<Profile>) {
    const { error } = await this.sb.from("profiles").update(patch).eq("id", id);
    if (error) throw error;
  }

  async setClaseDecanos(claseId: string, ids: string[]) {
    const { error } = await this.sb.rpc("set_clase_decanos", { p_clase: claseId, p_ids: ids });
    if (error) throw error;
  }
  async setClaseMaestros(claseId: string, ids: string[]) {
    const { error } = await this.sb.rpc("set_clase_maestros", { p_clase: claseId, p_ids: ids });
    if (error) throw error;
  }
  async importClase(d: ClaseDraft) {
    const { error } = await this.sb.rpc("import_clase", { p: d });
    if (error) throw error;
  }
  async replaceResultados(claseId: string, d: Pick<ClaseDraft, "metrics" | "estudiantes" | "archivo">) {
    const { error } = await this.sb.rpc("replace_resultados", { p_clase: claseId, p: d });
    if (error) throw error;
  }
  async updateClase(id: string, patch: Partial<Clase>) {
    const { error } = await this.sb.from("clases").update(patch).eq("id", id);
    if (error) throw error;
  }
  async deleteClase(id: string) {
    const { error } = await this.sb.from("clases").delete().eq("id", id);
    if (error) throw error;
  }
  async updateResultado(id: string, patch: Partial<Resultado>) {
    const { error } = await this.sb.from("resultados").update(patch).eq("id", id);
    if (error) throw error;
  }
  async upsertCarreras(list: Carrera[]) {
    const { error } = await this.sb.from("carreras").upsert(list);
    if (error) throw error;
  }
  async loadRoster() { return this.all<RosterEntry>("roster", "matricula,nombre,carrera,grupo"); }
  async saveRoster(list: RosterEntry[]) {
    const del = await this.sb.from("roster").delete().not("id", "is", null);
    if (del.error) throw del.error;
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await this.sb.from("roster").insert(list.slice(i, i + 500));
      if (error) throw error;
    }
  }
}
