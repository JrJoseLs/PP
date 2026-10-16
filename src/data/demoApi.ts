/* Backend simulado en el navegador. Aplica las MISMAS reglas que las
   políticas RLS de supabase/migrations/001_esquema.sql, para que el modo
   demo muestre fielmente lo que cada rol puede ver y hacer. */
import type { Api } from "./api";
import type { Carrera, Clase, ClaseDraft, NewUser, Profile, Resultado, ResultadoPatch, RosterEntry, Snapshot } from "../lib/types";
import { buildDemo, type DemoDb } from "./demoSeed";

const DB_KEY = "pp_demo_db_v1";
const SES_KEY = "pp_demo_session";
const wait = (ms = 140) => new Promise((r) => setTimeout(r, ms));
const deny = () => { throw new Error("No tienes permiso para hacer esto."); };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const strip = ({ password: _p, ...p }: Profile & { password?: string }): Profile => p;

export class DemoApi implements Api {
  mode = "demo" as const;
  private db: DemoDb;
  private me: Profile | null = null;

  constructor() {
    let db: DemoDb | null = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY) || "null"); } catch { /* */ }
    this.db = db && db.version === 2 ? db : buildDemo();
  }
  private save() { try { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); } catch { /* lleno o bloqueado */ } }
  static reset() { try { localStorage.removeItem(DB_KEY); } catch { /* */ } }

  private get user() { if (!this.me) throw new Error("Sesión no iniciada"); return this.me; }
  private isAdmin() { return this.user.rol === "admin"; }
  private decanoOwns(c: Clase) { return this.user.rol === "decano" && c.decanos.includes(this.user.id); }
  private canSee(c: Clase) {
    const u = this.user;
    return u.rol === "admin" || this.decanoOwns(c) || (u.rol === "maestro" && c.maestros.includes(u.id));
  }
  private isMyMaestro(id: string) {
    const p = this.db.profiles.find((x) => x.id === id);
    return this.user.rol === "decano" && !!p && p.rol === "maestro" && p.decano_id === this.user.id;
  }
  private clase(id: string) { const c = this.db.clases.find((x) => x.id === id); if (!c) throw new Error("Clase no encontrada"); return c; }

  async restore() {
    const id = localStorage.getItem(SES_KEY);
    const p = id && this.db.profiles.find((x) => x.id === id && x.activo);
    return (this.me = p ? strip(p) : null);
  }
  async signIn(usuario: string, password: string) {
    await wait(380);
    const p = this.db.profiles.find((x) => x.usuario === usuario.trim().toLowerCase());
    if (!p || p.password !== password) throw new Error("Usuario o contraseña incorrectos.");
    if (!p.activo) throw new Error("Tu usuario está desactivado. Contacta a administración.");
    localStorage.setItem(SES_KEY, p.id);
    return (this.me = strip(p));
  }
  async signOut() { localStorage.removeItem(SES_KEY); this.me = null; }

  async load(): Promise<Snapshot> {
    await wait();
    const u = this.user;
    const profiles = this.db.profiles.filter((p) =>
      p.id === u.id || u.rol === "admin" || (u.rol === "decano" && p.decano_id === u.id) || p.id === u.decano_id).map(strip);
    const clases = this.db.clases.filter((c) => this.canSee(c)).map((c) => ({
      ...c,
      decanos: u.rol === "admin" ? c.decanos : c.decanos.filter((d) => d === u.id),
      maestros: u.rol === "maestro" ? c.maestros.filter((m) => m === u.id) : c.maestros,
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
    const ids = new Set(clases.map((c) => c.id));
    return { profiles, clases, resultados: this.db.resultados.filter((r) => ids.has(r.clase_id)), carreras: this.db.carreras, ajustes: this.db.ajustes ?? {} };
  }

  async createUser(n: NewUser) {
    await wait();
    const u = this.user;
    if (u.rol === "maestro") deny();
    const usuario = n.usuario.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(usuario)) throw new Error("Usuario inválido (mín. 3: letras, números, . _ -)");
    if (n.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    if (this.db.profiles.some((p) => p.usuario === usuario)) throw new Error("Ese usuario ya existe");
    const rol = u.rol === "admin" ? n.rol : "maestro";
    const p = { id: "u-" + uid(), usuario, nombre: n.nombre.trim() || usuario, rol, activo: true, password: n.password,
      decano_id: rol === "maestro" ? (u.rol === "decano" ? u.id : n.decano_id) : null };
    this.db.profiles.push(p); this.save();
    return strip(p);
  }
  async updateProfile(id: string, patch: Partial<Profile>) {
    await wait();
    const p = this.db.profiles.find((x) => x.id === id); if (!p) throw new Error("Usuario no encontrado");
    if (this.isAdmin()) {
      if (id === this.user.id && (patch.rol && patch.rol !== "admin" || patch.activo === false)) throw new Error("No puedes quitarte a ti mismo el acceso de administración");
      Object.assign(p, patch);
      if (p.rol !== "maestro") p.decano_id = null;
    } else if (this.isMyMaestro(id)) {
      if ((patch.rol && patch.rol !== "maestro") || (patch.decano_id !== undefined && patch.decano_id !== this.user.id)) deny();
      Object.assign(p, patch);
    } else deny();
    this.save();
  }
  async setPassword(id: string, password: string) {
    await wait();
    if (!this.isAdmin() && !this.isMyMaestro(id)) deny();
    if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    const p = this.db.profiles.find((x) => x.id === id)!; p.password = password; this.save();
  }
  async changeMyPassword(password: string) {
    await wait();
    if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    this.db.profiles.find((x) => x.id === this.user.id)!.password = password; this.save();
  }
  async deleteUser(id: string) {
    await wait();
    if (id === this.user.id) throw new Error("No puedes eliminar tu propia cuenta");
    if (!this.isAdmin() && !this.isMyMaestro(id)) deny();
    this.db.profiles = this.db.profiles.filter((p) => p.id !== id);
    this.db.profiles.forEach((p) => { if (p.decano_id === id) p.decano_id = null; });
    this.db.clases.forEach((c) => { c.decanos = c.decanos.filter((x) => x !== id); c.maestros = c.maestros.filter((x) => x !== id); });
    this.save();
  }

  async setClaseDecanos(claseId: string, ids: string[]) {
    await wait(80);
    if (!this.isAdmin()) deny();
    this.clase(claseId).decanos = [...new Set(ids)]; this.save();
  }
  async setClaseMaestros(claseId: string, ids: string[]) {
    await wait(80);
    const c = this.clase(claseId);
    if (!this.isAdmin()) {
      if (!this.decanoOwns(c)) deny();
      if (ids.some((m) => !c.maestros.includes(m) && !this.isMyMaestro(m))) deny();
    }
    c.maestros = [...new Set(ids)]; this.save();
  }
  async importClase(d: ClaseDraft) {
    await wait(220);
    if (!this.isAdmin()) deny();
    const id = "c-" + uid();
    this.db.clases.push({ id, nombre: d.nombre, grupo: d.grupo, periodo: d.periodo, color: d.color, metrics: d.metrics,
      archivo: d.archivo, created_at: new Date().toISOString(), decanos: d.decanos, maestros: [] });
    d.estudiantes.forEach((e) => this.db.resultados.push({ ...e, id: "r-" + uid(), clase_id: id }));
    this.save();
  }
  async replaceResultados(claseId: string, d: Pick<ClaseDraft, "metrics" | "estudiantes" | "archivo">) {
    await wait(200);
    if (!this.isAdmin()) deny();
    const c = this.clase(claseId);
    c.metrics = d.metrics; c.archivo = d.archivo;
    this.db.resultados = this.db.resultados.filter((r) => r.clase_id !== claseId);
    d.estudiantes.forEach((e) => this.db.resultados.push({ ...e, id: "r-" + uid(), clase_id: claseId }));
    this.save();
  }
  async updateClase(id: string, patch: Partial<Clase>) {
    await wait(80);
    if (!this.isAdmin()) deny();
    Object.assign(this.clase(id), patch); this.save();
  }
  async deleteClase(id: string) {
    await wait();
    if (!this.isAdmin()) deny();
    this.db.clases = this.db.clases.filter((c) => c.id !== id);
    this.db.resultados = this.db.resultados.filter((r) => r.clase_id !== id);
    this.save();
  }
  async updateResultado(id: string, patch: Partial<Resultado>) {
    await wait(60);
    if (!this.isAdmin()) deny();
    const r = this.db.resultados.find((x) => x.id === id); if (!r) throw new Error("Resultado no encontrado");
    Object.assign(r, patch); this.save();
  }
  async setAjuste(clave: string, valor: unknown) {
    await wait(80);
    if (!this.isAdmin()) deny();
    this.db.ajustes = { ...(this.db.ajustes ?? {}), [clave]: valor };
    this.save();
  }
  async upsertCarreras(list: Carrera[]) {
    await wait(60);
    if (!this.isAdmin()) deny();
    list.forEach((c) => { const e = this.db.carreras.find((x) => x.codigo === c.codigo); if (e) e.nombre = c.nombre; else this.db.carreras.push(c); });
    this.save();
  }
  async loadRoster() { if (!this.isAdmin()) deny(); return this.db.roster; }
  async saveRoster(list: RosterEntry[]) { if (!this.isAdmin()) deny(); this.db.roster = list; this.save(); }
  async syncResultados(list: ResultadoPatch[]) {
    await wait(120);
    if (!this.isAdmin()) deny();
    const byId = new Map(this.db.resultados.map((r) => [r.id, r]));
    let n = 0;
    list.forEach(({ id, ...patch }) => { const r = byId.get(id); if (r) { Object.assign(r, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))); n++; } });
    this.save();
    return n;
  }
}
