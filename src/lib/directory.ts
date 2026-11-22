/* Directorio de estudiantes: une listados de cualquier origen (ADM535, listas del juego,
   recopilaciones propias) y enlaza los informes del juego con cada persona.
   - Reconoce las columnas por su encabezado (español o inglés) y, si no, por su contenido.
   - Busca a cada persona por matrícula → licencia → correo → nombre (+ equipo/grupo para desempatar).
   - Fusiona: completa lo que falta sin borrar lo existente; las diferencias se muestran como conflictos.
   La contraseña y los teléfonos de los listados se ignoran siempre. */
import type { Resultado, ResultadoPatch, RosterEntry } from "./types";
import { METRICS_FALLBACK, nameTokens, normText } from "./metrics";
import { isExample } from "./templates";

export type Field = "nombre" | "nombres" | "apellidos" | "matricula" | "carrera" | "grupo" | "equipo" | "email" | "licencia" | "ignorar" | "privado";
export const FIELD_LABEL: Record<Field, string> = {
  nombre: "Nombre completo", nombres: "Nombre(s)", apellidos: "Apellidos", matricula: "Matrícula / ID",
  carrera: "Carrera", grupo: "Grupo / sección", equipo: "Equipo del juego", email: "Correo", licencia: "Licencia del juego",
  ignorar: "No usar", privado: "No usar (dato privado)",
};
export const PERSON_FIELDS: (keyof RosterEntry)[] = ["matricula", "nombre", "carrera", "grupo", "equipo", "email", "licencia"];

const SYN: Partial<Record<Field, string[]>> = {
  nombre: ["NOMBRE", "NOMBRE COMPLETO", "ESTUDIANTE", "ALUMNO", "ALUMNA", "FULL NAME", "NAME", "STUDENT", "STUDENT NAME", "NOMBRE DEL ESTUDIANTE", "PARTICIPANTE", "NOMBRE Y APELLIDOS"],
  nombres: ["NOMBRES", "FIRST NAME", "FIRSTNAME", "GIVEN NAME", "PRIMER NOMBRE", "NOMBRE S"],
  apellidos: ["APELLIDOS", "APELLIDO", "LAST NAME", "LASTNAME", "SURNAME", "FAMILY NAME"],
  matricula: ["MATRICULA", "ID", "ID ESTUDIANTE", "ID ALUMNO", "CARNET", "CARNE", "STUDENT ID", "CODIGO", "CODIGO ESTUDIANTE", "NUMERO DE MATRICULA", "EXPEDIENTE"],
  carrera: ["CARRERA", "PROGRAMA", "PROGRAM", "MAJOR", "PLAN DE ESTUDIOS", "ESCUELA"],
  grupo: ["GRUPO", "RNC", "NRC", "SECCION", "SECTION", "PARALELO", "CLASS"],
  equipo: ["TEAM", "EQUIPO", "EMPRESA", "COMPANY", "TEAM NAME", "EQUIPO DEL JUEGO"],
  email: ["EMAIL", "EMAIL ADDRESS", "E MAIL", "CORREO", "CORREO ELECTRONICO", "CORREO INST", "CORREO INSTITUCIONAL", "MAIL"],
  licencia: ["LICENSE NUMBER", "LICENSE", "LICENCIA", "NUMERO DE LICENCIA", "LICENSE NO", "LICENCIA DEL JUEGO"],
  privado: ["PASSWORD", "CONTRASENA", "CLAVE", "TELEFONO", "TELEFONO RES", "TELEFONO CEL", "CELULAR", "PHONE", "MOBILE", "CORREO PERS", "CORREO PERSONAL", "DIRECCION", "ADDRESS"],
  ignorar: ["PERIODO", "ASIGNATURA", "DOCENTE", "ID DOCENTE", "N", "NO", "NUM", "#"],
};
const LOOKUP = new Map<string, Field>();
Object.entries(SYN).forEach(([f, list]) => list!.forEach((s) => LOOKUP.set(s, f as Field)));

/** Qué es una columna según su encabezado: primero la lista exacta y, si no, por palabras clave en español
    o inglés («Nombre completo del estudiante», «Carrera / Programa», «Apellidos y nombres», «Student Name», «Major»…).
    El orden importa: «Nombre del docente» se ignora y «Correo del estudiante» es correo, no nombre. */
export function fieldOfHeader(h: string): Field | null {
  const n = normText(h);
  if (!n) return null;
  const exacto = LOOKUP.get(n);
  if (exacto) return exacto;
  // datos privados: nunca se guardan
  if (/CONTRASE|PASSWORD|\bPASS\b|CLAVE|TELEF|CELULAR|PHONE|MOBILE|MOVIL|DIRECCION|ADDRESS|PERSONAL|CEDULA|PASAPORTE|PASSPORT|\bSSN\b|BIRTH|NACIMIENTO/.test(n)) return "privado";
  // datos de la asignatura o del profesor, no de la persona
  if (/DOCENTE|PROFESOR|MAESTRO|INSTRUCTOR|TEACHER|LECTURER|TUTOR|ASIGNATURA|MATERIA|SUBJECT|\bCOURSE\b|PERIODO|\bTERM\b|SEMESTER|SEMESTRE|CAMPUS|SEDE|FECHA|\bDATE\b|\bNOTA\b|CALIFICACION|\bGRADE\b|SCORE|PUNTAJE|CREDITO|CREDIT|ESTADO|STATUS|OBSERVACION|COMMENT/.test(n)) return "ignorar";
  if (/CORREO|E ?MAIL|\bMAIL\b/.test(n)) return "email";
  if (/LICEN/.test(n)) return "licencia";
  // carrera: también programa, titulación, especialidad, major, degree, field of study…
  if (/CARRERA|CAREER|PROGRAMA|PROGRAM|MAJOR|PLAN DE ESTUDIO|TITULACION|ESPECIALIDAD|LICENCIATURA|MENCION|ESCUELA|SCHOOL|FACULTAD|FACULTY|DEPARTAMENTO|DEPARTMENT|DEGREE|FIELD OF STUDY|DISCIPLINE|CONCENTRATION/.test(n)) return "carrera";
  // matrícula / identificador del estudiante
  if (/MATRICULA|CARNE|CARNET|EXPEDIENTE|REGISTRO|STUDENT ID|STUDENT NUMBER|STUDENT NO\b|ENROLL|REGISTRATION|\bROLL\b|\bID NUMBER|^ID\b|\bID$|CODIGO|^COD\b|\bUSER ?ID/.test(n)) return "matricula";
  if (/EQUIPO|\bTEAM\b|EMPRESA|COMPANY|\bFIRM\b/.test(n)) return "equipo";
  if (/GRUPO|\bGROUP\b|SECCION|SECTION|\bNRC\b|\bRNC\b|PARALELO|COHORTE|COHORT/.test(n)) return "grupo";
  // apellidos solos, o «Apellidos y nombres» (nombre completo)
  if (/APELLIDO|SURNAME|LAST ?NAME|FAMILY NAME/.test(n)) return /NOMBRE|FIRST|GIVEN/.test(n) ? "nombre" : "apellidos";
  if (/^NOMBRES$|FIRST ?NAME|PRIMER NOMBRE|GIVEN ?NAME|FORENAME|NOMBRES DE PILA/.test(n)) return "nombres";
  if (/NOMBRE|ESTUDIANTE|ALUMN|DISCENTE|STUDENT|LEARNER|PUPIL|PARTICIPANTE|PARTICIPANT|\bNAME\b|FULL ?NAME/.test(n)) return "nombre";
  return null;
}

/* ---------- Reconocer columnas por su contenido (archivos sin encabezados o con encabezados que no dicen nada) ---------- */
const pareceNombre = (v: string) => {
  const w = v.replace(/[,.]/g, " ").trim().split(/\s+/);
  return w.length >= 2 && w.length <= 7 && v.length >= 7 && w.every((x) => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]+$/.test(x));
};
const pareceCodigoCarrera = (v: string) => /^[A-ZÁÉÍÓÚÑ]{2,6}$/.test(v.trim());
const pareceMatricula = (v: string) => /^[A-Z]{0,3}\d{6,10}$/i.test(v.replace(/[-\s]/g, ""));
/** `conocidas`: códigos y nombres de carreras ya registradas (normalizados con normText) */
function porContenido(vals: string[], conocidas?: Set<string>): Field | null {
  const v = vals.filter(Boolean);
  if (v.length < 3) return null;
  const frac = (fn: (x: string) => boolean) => v.filter(fn).length / v.length;
  const unicos = new Set(v.map(normText)).size / v.length;
  if (frac((x) => /@/.test(x)) > 0.6) return "email";
  if (conocidas?.size && frac((x) => conocidas.has(normText(x))) > 0.6) return "carrera";
  if (frac(pareceCodigoCarrera) > 0.8 && unicos <= 0.8) return "carrera";
  if (frac(pareceMatricula) > 0.8 && unicos > 0.9) return "matricula";
  if (frac(pareceNombre) > 0.7 && unicos > 0.85) return "nombre";
  return null;
}

const KNOWN_METRICS = new Set(METRICS_FALLBACK.map(normText));
type Rows = unknown[][];
const str = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "number" ? String(Math.round(v)) : String(v)).replace(/\s+/g, " ").trim();

/* ---------- 1. ¿Qué tipo de archivo es y dónde están los encabezados? ---------- */
export type FileKind = { kind: "informe"; header: number } | { kind: "listado"; header: number; mapping: Field[] } | { kind: "desconocido" };

export function detectFile(rows: Rows, conocidas?: Set<string>): FileKind {
  let best = { i: -1, score: 0 };
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const n = (rows[i] ?? []).map((v) => normText(v));
    if (n[0] === "ESTUDIANTE" && n.filter((v) => KNOWN_METRICS.has(v)).length >= 3) return { kind: "informe", header: i };
    const score = n.filter((v) => { const f = v && v.length < 60 ? fieldOfHeader(v) : null; return f && f !== "ignorar" && f !== "privado"; }).length;
    if (score > best.score) best = { i, score };
  }
  // sirve si se sabe quién es (nombre, o nombres + apellidos) y hay al menos otro dato útil
  const util = (m: Field[]) => (m.includes("nombre") || (m.includes("nombres") && m.includes("apellidos")))
    && m.some((f) => ["carrera", "matricula", "email", "grupo", "equipo", "licencia"].includes(f));
  if (best.score >= 1) { const m = guessMapping(rows, best.i, conocidas); if (util(m)) return { kind: "listado", header: best.i, mapping: m }; }
  // sin encabezados: las columnas se reconocen solo por lo que contienen
  const m = guessMapping(rows, -1, conocidas);
  if (util(m)) {
    // si la primera fila no parece una persona («Col1», «Datos»…), es un encabezado sin sentido: se salta
    const c = m.indexOf("nombre"), primera = c >= 0 ? str(rows[0]?.[c]) : "";
    if (c >= 0 && !pareceNombre(primera)) { const m0 = guessMapping(rows, 0, conocidas); if (util(m0)) return { kind: "listado", header: 0, mapping: m0 }; }
    return { kind: "listado", header: -1, mapping: m };
  }
  return { kind: "desconocido" };
}

/** Propone qué es cada columna: por el encabezado y, si no lo reconoce, por los valores */
export function guessMapping(rows: Rows, h: number, conocidas?: Set<string>): Field[] {
  const head = h >= 0 ? (rows[h] ?? []).map((v) => str(v)) : [];
  const width = Math.max(head.length, ...rows.slice(h + 1, h + 30).map((r) => r?.length ?? 0));
  const map: Field[] = Array.from({ length: width }, (_, c) => (head[c] && head[c].length < 60 ? fieldOfHeader(head[c]) : null) ?? "ignorar");
  // por contenido: columnas sin encabezado o con un encabezado que no dice nada
  map.forEach((f, c) => {
    if (f !== "ignorar" || (head[c] && fieldOfHeader(head[c]) === "ignorar")) return;
    const vals = rows.slice(h + 1, h + 60).map((r) => str(r?.[c]));
    const g = porContenido(vals, conocidas);
    if (g && !map.includes(g)) map[c] = g;
  });
  // "Nombre" + "Apellidos" → "Nombre" son solo los nombres de pila; "Nombres" sin apellidos → nombre completo
  if (map.includes("apellidos") && !map.includes("nombres")) { const i = map.indexOf("nombre"); if (i >= 0) map[i] = "nombres"; }
  if (map.includes("nombres") && !map.includes("apellidos") && !map.includes("nombre")) map[map.indexOf("nombres")] = "nombre";
  // un solo campo de cada tipo: si se repite (ej. dos correos), el resto se ignora
  const seen = new Set<Field>();
  return map.map((f) => { if (f === "ignorar" || f === "privado") return f; if (seen.has(f)) return "ignorar"; seen.add(f); return f; });
}

/* ---------- 2. Leer las personas de un listado ---------- */
export function extractPeople(rows: Rows, h: number, mapping: Field[]): RosterEntry[] {
  const out: RosterEntry[] = [];
  const seen = new Set<string>();
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const get = (f: Field) => { const c = mapping.indexOf(f); return c >= 0 ? str(r[c]) : ""; };
    const nombre = get("nombre") || [get("nombres"), get("apellidos")].filter(Boolean).join(" ");
    if (!nombre || isExample(nombre) || nombre.length < 3) continue;
    const p: RosterEntry = {
      nombre, matricula: get("matricula"), carrera: get("carrera"), grupo: get("grupo").replace(/^(grupo|secci[oó]n)\s*[-:#.]?\s*/i, ""),
      equipo: get("equipo"), email: get("email").toLowerCase(), licencia: get("licencia"),
    };
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k); out.push(p);
  }
  return out;
}
const keyOf = (p: RosterEntry) => p.matricula ? "m:" + p.matricula.toUpperCase() : p.licencia ? "l:" + p.licencia : p.email ? "e:" + p.email : "n:" + nameTokens(p.nombre).sort().join(" ");

/* ---------- 3. Buscar personas en el directorio ---------- */
export type How = "matricula" | "licencia" | "email" | "nombre";
export interface Found { e: RosterEntry | null; how?: How; seguro: boolean; candidatos: RosterEntry[]; }

export class Directory {
  private byMat = new Map<string, RosterEntry>();
  private byLic = new Map<string, RosterEntry>();
  private byMail = new Map<string, RosterEntry>();
  private idx: { e: RosterEntry; toks: Set<string> }[] = [];
  constructor(public list: RosterEntry[]) {
    list.forEach((e) => {
      if (e.matricula) this.byMat.set(e.matricula.toUpperCase(), e);
      if (e.licencia) this.byLic.set(e.licencia, e);
      if (e.email) this.byMail.set(e.email.toLowerCase(), e);
      this.idx.push({ e, toks: new Set(nameTokens(e.nombre)) });
    });
  }
  find(p: { nombre: string; matricula?: string; licencia?: string; email?: string; equipo?: string; grupo?: string }): Found {
    const exact = (e: RosterEntry | undefined, how: How): Found | null => (e ? { e, how, seguro: true, candidatos: [e] } : null);
    const hit = (p.matricula && exact(this.byMat.get(p.matricula.toUpperCase()), "matricula"))
      || (p.licencia && exact(this.byLic.get(p.licencia), "licencia"))
      || (p.email && exact(this.byMail.get(p.email.toLowerCase()), "email"));
    if (hit) return hit;
    // por nombre: palabras en común, sin importar el orden ("PÉREZ GÓMEZ, ANA" = "Ana Pérez Gómez")
    const t = new Set(nameTokens(p.nombre));
    if (t.size < 2) return { e: null, seguro: false, candidatos: [] };
    const scored: { e: RosterEntry; s: number }[] = [];
    for (const x of this.idx) {
      let inter = 0; t.forEach((w) => { if (x.toks.has(w)) inter++; });
      const min = Math.min(t.size, x.toks.size);
      if (!(inter >= 3 || (inter >= 2 && inter === min))) continue;
      let s = inter / (t.size + x.toks.size - inter);
      // el equipo o el grupo iguales desempatan
      if (p.equipo && x.e.equipo && normText(p.equipo) === normText(x.e.equipo)) s += 0.15;
      if (p.grupo && x.e.grupo && p.grupo === x.e.grupo) s += 0.05;
      scored.push({ e: x.e, s });
    }
    scored.sort((a, b) => b.s - a.s);
    if (!scored.length) return { e: null, seguro: false, candidatos: [] };
    const tie = scored.length > 1 && scored[1].s >= scored[0].s - 0.001;
    if (tie) return { e: null, seguro: false, candidatos: scored.slice(0, 4).map((x) => x.e) };
    return { e: scored[0].e, how: "nombre", seguro: scored[0].s >= 0.66, candidatos: scored.slice(0, 4).map((x) => x.e) };
  }
}

/* ---------- 4. Fusionar un listado nuevo en el directorio ---------- */
export interface Conflict { nombre: string; campo: keyof RosterEntry; actual: string; nuevo: string; }
export interface MergeResult { list: RosterEntry[]; nuevos: number; completados: number; iguales: number; conflictos: Conflict[]; }

export function mergePeople(current: RosterEntry[], incoming: RosterEntry[], archivoManda = false): MergeResult {
  const list = current.map((e) => ({ ...e }));
  const dir = new Directory(list);
  let nuevos = 0, completados = 0, iguales = 0;
  const conflictos: Conflict[] = [];
  for (const p of incoming) {
    const f = dir.find(p);
    const e = f.e && (f.seguro || f.how !== "nombre") ? f.e : f.e && f.candidatos.length === 1 ? f.e : null;
    if (!e) { list.push({ ...p }); dir.list = list; nuevos++; refresh(dir, list); continue; }
    let changed = false;
    for (const k of PERSON_FIELDS) {
      const nv = (p[k] ?? "").trim(), ov = (e[k] ?? "").trim();
      if (!nv || nv === ov) continue;
      if (!ov) { e[k] = nv; changed = true; continue; }
      if (k === "nombre") continue;               // el nombre se conserva tal como está
      if (archivoManda) { e[k] = nv; changed = true; }
      else conflictos.push({ nombre: e.nombre, campo: k, actual: ov, nuevo: nv });
    }
    if (changed) completados++; else iguales++;
  }
  return { list, nuevos, completados, iguales, conflictos };
}
function refresh(dir: Directory, list: RosterEntry[]) { Object.assign(dir, new Directory(list)); }

/* ---------- 5. Completar resultados ya cargados con el directorio ---------- */
/** `emails`: correo de cada resultado (id → correo), p. ej. el del informe del juego. Si coincide con el directorio, el enlace es seguro. */
export function syncPatches(resultados: Resultado[], list: RosterEntry[], emails?: Map<string, string>): ResultadoPatch[] {
  const dir = new Directory(list);
  const out: ResultadoPatch[] = [];
  for (const r of resultados) {
    const f = dir.find({ nombre: r.nombre, matricula: r.matricula, equipo: r.equipo, grupo: r.grupo, email: emails?.get(r.id) || undefined });
    if (!f.e || !(f.seguro || f.how !== "nombre")) continue;
    const p: ResultadoPatch = { id: r.id };
    if (!r.matricula && f.e.matricula) p.matricula = f.e.matricula;
    if (!r.carrera && f.e.carrera) p.carrera = f.e.carrera;
    if (!r.grupo && f.e.grupo) p.grupo = f.e.grupo;
    if (!r.equipo && f.e.equipo) p.equipo = f.e.equipo;
    if (Object.keys(p).length > 1) out.push(p);
  }
  return out;
}

/** Qué tan completo está el directorio */
export function completeness(list: RosterEntry[]) {
  const sinCarrera = list.filter((e) => !e.carrera).length;
  const sinMatricula = list.filter((e) => !e.matricula).length;
  const sinGrupo = list.filter((e) => !e.grupo).length;
  const total = list.length || 1;
  const pct = Math.round((1 - (sinCarrera + sinMatricula) / (2 * total)) * 100);
  return { sinCarrera, sinMatricula, sinGrupo, pct: list.length ? pct : 0 };
}
