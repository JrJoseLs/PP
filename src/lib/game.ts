/* Desempeño en el juego: informe «igrades» de Marketplace.
   Hojas: «Desempeño por Equipos» (Scorecard, tiempo total, percentil, puntaje) y
          «Desempeño por Jugadores» (nombre, correo, empresa, tiempo propio, puntajes).
   Los encabezados se reconocen por palabras clave (español o inglés), así que tolera
   cambios menores de redacción entre versiones del juego. */
import type { Desempeno, DesempenoEquipo, Resultado } from "./types";
import { Directory } from "./directory";
import { normText } from "./metrics";
import { isExample } from "./templates";

type Rows = unknown[][];
export type Jugador = Omit<Desempeno, "id" | "clase_id">;
export type Equipo = Omit<DesempenoEquipo, "clase_id">;
export interface Igrades { jugadores: Jugador[]; equipos: Equipo[]; }

type Col = "nombre" | "apellido" | "email" | "equipo" | "trimestres" | "bsc_acum" | "bsc" | "minutos" | "percentil" | "puntaje" | "puntaje_ajustado";
function colOf(h: string): Col | null {
  const n = normText(h);
  if (!n) return null;
  if (/GASTADO|TIME SPENT|TIEMPO/.test(n)) return "minutos";
  if (/INSTRUCTOR/.test(n)) return "puntaje_ajustado";
  if (/AUTOMATIC/.test(n)) return "puntaje";
  if (/PERCENTIL/.test(n)) return "percentil";
  if (/TARJETA|SCORECARD/.test(n)) return /ACUMULAD|CUMULATIVE/.test(n) ? "bsc_acum" : "bsc";
  if (/TRIMESTRE|QUARTER/.test(n)) return "trimestres";
  if (/^(EMPRESA|EQUIPO|TEAM|COMPANY)/.test(n)) return "equipo";
  if (/CORREO|EMAIL/.test(n)) return "email";
  if (/APELLIDO|LAST NAME|SURNAME/.test(n)) return "apellido";
  if (/NOMBRE|FIRST NAME|^NAME$/.test(n)) return "nombre";
  return null;
}
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(",", ".").trim();
  if (!s || /n\s*\/\s*a/i.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Encuentra la fila de encabezados de una hoja y qué es cada columna */
function header(rows: Rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cols = (rows[i] ?? []).map((v) => colOf(str(v)));
    if (cols.filter(Boolean).length >= 3 && cols.includes("equipo")) return { i, cols };
  }
  return null;
}

/** ¿Es un libro «igrades»? Devuelve jugadores y equipos, o null */
export function parseIgrades(book: Record<string, Rows>): Igrades | null {
  const out: Igrades = { jugadores: [], equipos: [] };
  for (const rows of Object.values(book)) {
    const h = header(rows);
    if (!h || !h.cols.some((c) => c === "minutos" || c === "bsc_acum" || c === "puntaje")) continue;
    const get = (r: unknown[], c: Col) => { const k = h.cols.indexOf(c); return k >= 0 ? r[k] : undefined; };
    const jugadores = h.cols.includes("nombre") || h.cols.includes("email");
    for (const r of rows.slice(h.i + 1)) {
      if (!r || !str(get(r, "equipo"))) continue;
      const base = { equipo: str(get(r, "equipo")), trimestres: num(get(r, "trimestres")), bsc_acum: num(get(r, "bsc_acum")), bsc: num(get(r, "bsc")), minutos: num(get(r, "minutos")), puntaje: num(get(r, "puntaje")) };
      if (jugadores) {
        const nombre = [str(get(r, "nombre")), str(get(r, "apellido")).replace(/^\.$/, "")].filter(Boolean).join(" ");
        if (!nombre || isExample(nombre)) continue;
        out.jugadores.push({ ...base, nombre, email: str(get(r, "email")).toLowerCase(), puntaje_ajustado: num(get(r, "puntaje_ajustado")) });
      } else {
        out.equipos.push({ ...base, percentil: num(get(r, "percentil")) });
      }
    }
  }
  if (!out.jugadores.length && !out.equipos.length) return null;
  // si solo vino la hoja de jugadores, los equipos se deducen de ella
  if (!out.equipos.length) {
    const map = new Map<string, Equipo>();
    out.jugadores.forEach((j) => {
      const e = map.get(j.equipo) ?? { equipo: j.equipo, trimestres: j.trimestres, bsc_acum: j.bsc_acum, bsc: j.bsc, minutos: 0, percentil: null, puntaje: j.puntaje };
      e.minutos = (e.minutos ?? 0) + (j.minutos ?? 0);
      map.set(j.equipo, e);
    });
    out.equipos = [...map.values()];
  }
  return out;
}

/** Enlaza cada jugador con un estudiante de la clase (por nombre + equipo). Devuelve el índice del resultado o -1 */
export function linkJugadores(jugadores: { nombre: string; equipo: string; email?: string }[], resultados: Pick<Resultado, "nombre" | "matricula" | "equipo" | "grupo">[],
  porEmail?: Map<string, string>) {
  const dir = new Directory(resultados.map((r) => ({ nombre: r.nombre, matricula: r.matricula, carrera: "", grupo: r.grupo, equipo: r.equipo ?? "" })));
  const usados = new Set<number>();
  return jugadores.map((j) => {
    // si el directorio conoce su correo, se busca por la matrícula de esa persona
    const mat = j.email && porEmail?.get(j.email);
    const f = dir.find({ nombre: j.nombre, equipo: j.equipo, matricula: mat || undefined });
    if (!f.e || !(f.seguro || f.how !== "nombre")) return -1;
    const k = dir.list.indexOf(f.e);
    if (usados.has(k)) return -1;
    usados.add(k);
    return k;
  });
}

/** ¿A qué clase pertenece? Puntúa por equipos en común y por estudiantes enlazados */
export function scoreClase(g: Igrades, resultados: Pick<Resultado, "nombre" | "matricula" | "equipo" | "grupo">[]) {
  const eqs = new Set(resultados.map((r) => normText(r.equipo ?? "")).filter(Boolean));
  const comunes = g.equipos.filter((e) => eqs.has(normText(e.equipo))).length;
  const enlazados = linkJugadores(g.jugadores, resultados).filter((k) => k >= 0).length;
  return { comunes, enlazados, score: enlazados * 2 + comunes * 3 };
}

/* ---------- utilidades ---------- */
export function fmtMin(m: number | null | undefined) {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  const t = Math.round(m);
  const h = Math.floor(t / 60), mm = t % 60;
  return h ? `${h} h${mm ? ` ${mm} min` : ""}` : `${mm} min`;
}
export function median(v: number[]) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}
/** Correlación de Pearson (−1…1); null con menos de 5 pares */
export function pearson(pairs: [number, number][]) {
  if (pairs.length < 5) return null;
  const n = pairs.length, mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  pairs.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
