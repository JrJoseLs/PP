/* Desempeño en el juego: informe «igrades» de Marketplace.
   Hojas: «Desempeño por Equipos» (Scorecard, tiempo total, percentil, puntaje) y
          «Desempeño por Jugadores» (nombre, correo, empresa, tiempo propio, puntajes).
   Los encabezados se reconocen por palabras clave (español o inglés), así que tolera
   cambios menores de redacción entre versiones del juego. */
import type { Desempeno, DesempenoEquipo, PuntoTrimestre, Resultado } from "./types";
import { Directory } from "./directory";
import { normText } from "./metrics";
import { isExample } from "./templates";

type Rows = unknown[][];
export type Jugador = Omit<Desempeno, "id" | "clase_id">;
export type Equipo = Omit<DesempenoEquipo, "clase_id">;
export interface Igrades { jugadores: Jugador[]; equipos: Equipo[]; }

type Col = "nombre" | "apellido" | "email" | "equipo" | "trimestres" | "bsc_acum" | "bsc" | "minutos" | "percentil" | "puntaje" | "puntaje_ajustado" | "tq";
function colOf(h: string): Col | null {
  const n = normText(h);
  if (!n) return null;
  // «Trimestre 1», «Trimestre 2»…: tiempo de cada trimestre (informe itimespent)
  if (/^(TRIMESTRE|QUARTER|Q) ?\d+$/.test(n)) return "tq";
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
    const tqs = h.cols.flatMap((c, k) => (c === "tq" ? [k] : []));
    for (const r of rows.slice(h.i + 1)) {
      if (!r || !str(get(r, "equipo"))) continue;
      const tiempos = tqs.length ? tqs.map((k) => num(r[k]) ?? 0) : null;
      // trimestres jugados: el informe de tiempo no los trae; se cuentan hasta el último con tiempo
      const jugados = tiempos ? tiempos.reduce((a, v, k) => (v > 0 ? k + 1 : a), 0) : null;
      const base = { equipo: str(get(r, "equipo")), trimestres: num(get(r, "trimestres")) ?? jugados, bsc_acum: num(get(r, "bsc_acum")), bsc: num(get(r, "bsc")),
        minutos: num(get(r, "minutos")) ?? (tiempos ? tiempos.reduce((a, b) => a + b, 0) : null), puntaje: num(get(r, "puntaje")), tiempos,
        historial: null as PuntoTrimestre[] | null };
      // cada igrades es el corte de un trimestre («Resultados del Trimestre» = 4): se guarda como un punto del historial
      if (!tiempos && base.trimestres && (base.bsc !== null || base.bsc_acum !== null))
        base.historial = [{ t: base.trimestres, bsc_acum: base.bsc_acum, bsc: base.bsc, minutos: base.minutos, puntaje: base.puntaje }];
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
      const e = map.get(j.equipo) ?? { equipo: j.equipo, trimestres: j.trimestres, bsc_acum: j.bsc_acum, bsc: j.bsc, minutos: 0, percentil: null, puntaje: j.puntaje, tiempos: null, historial: j.historial ?? null };
      e.minutos = (e.minutos ?? 0) + (j.minutos ?? 0);
      if (j.tiempos) e.tiempos = j.tiempos.map((v, k) => v + (e.tiempos?.[k] ?? 0));
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

/* ---------- varios informes del mismo juego ---------- */
/** Código del juego en el nombre del archivo: «igrades-29740-00005-73609-q4.xlsx» → «29740-00005-73609» */
export const gameCode = (fileName: string) => fileName.match(/(\d{4,6}-\d{4,6}(?:-\d{4,6})?)/)?.[1] ?? null;
/** Trimestre del informe («…-q5.xlsx» → 5); 0 si no lo dice */
export const gameQuarter = (fileName: string) => Number(fileName.match(/-q(\d+)/i)?.[1] ?? 0);
/** Nombre de la clase que se crea desde el juego: el mismo que tendrá su informe de competencias, para que este luego la reemplace */
export const claseNameFromGame = (fileName: string) => { const c = gameCode(fileName); return c ? `Clase ${c}` : fileName.replace(/\.(xlsx|xls|csv)$/i, ""); };

type ConHist = { trimestres: number | null; historial?: PuntoTrimestre[] | null; tiempos?: number[] | null };
/** Último trimestre que refleja un registro */
const ultimoT = (x: ConHist) => Math.max(x.trimestres ?? 0, ...(x.historial ?? []).map((p) => p.t));
/** Une historiales por trimestre; si un trimestre se repite, manda `b` */
function unirHist(a?: PuntoTrimestre[] | null, b?: PuntoTrimestre[] | null) {
  const m = new Map<number, PuntoTrimestre>();
  [...(a ?? []), ...(b ?? [])].forEach((p) => m.set(p.t, p));
  return m.size ? [...m.values()].sort((x, y) => x.t - y.t) : null;
}

/** Une dos informes del mismo juego (igrades + itimespent, o trimestres distintos).
    Los datos actuales salen del informe del trimestre más reciente; el historial guarda todos. */
export function mergeIgrades(viejo: Igrades, nuevo: Igrades): Igrades {
  const keyJ = (j: Jugador) => j.email || normText(j.nombre);
  const mezcla = <T extends ConHist>(a: T, b: T): T => {
    const [antes, despues] = ultimoT(a) > ultimoT(b) ? [b, a] : [a, b];
    const out = { ...antes } as Record<string, unknown>;
    Object.entries(despues as Record<string, unknown>).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== "") out[k] = v; });
    out.historial = unirHist(a.historial, b.historial);
    out.tiempos = (b.tiempos?.length ?? 0) >= (a.tiempos?.length ?? 0) ? b.tiempos ?? a.tiempos ?? null : a.tiempos;
    return out as T;
  };
  const une = <T extends ConHist>(xs: T[], ys: T[], key: (x: T) => string) => {
    const m = new Map(xs.map((x) => [key(x), x] as const));
    ys.forEach((y) => { const x = m.get(key(y)); m.set(key(y), x ? mezcla(x, y) : y); });
    return [...m.values()];
  };
  return { jugadores: une(viejo.jugadores, nuevo.jugadores, keyJ), equipos: une(viejo.equipos, nuevo.equipos, (e) => normText(e.equipo)) };
}

/** ¿Son del mismo juego? (al menos la mitad de los jugadores nuevos ya estaban) */
export function mismoJuego(antes: Pick<Igrades, "jugadores">, nuevo: Pick<Igrades, "jugadores">) {
  const k = (j: { email: string; nombre: string }) => j.email || normText(j.nombre);
  const set = new Set(antes.jugadores.map(k));
  return nuevo.jugadores.length > 0 && nuevo.jugadores.filter((j) => set.has(k(j))).length >= nuevo.jugadores.length / 2;
}
/** Trimestres presentes en un conjunto de registros */
export const trimestresDe = (xs: ConHist[]) => [...new Set(xs.flatMap((x) => (x.historial ?? []).map((p) => p.t)))].sort((a, b) => a - b);

/* ---------- series por trimestre (para los gráficos) ---------- */
export type SerieQ = "bsc" | "bsc_acum" | "tiempo";
/** Valor de un registro en cada trimestre 1…n */
export function valoresQ(x: ConHist & { minutos?: number | null }, k: SerieQ, n: number): (number | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i + 1;
    if (k === "tiempo") {
      if (x.tiempos?.length) return i < x.tiempos.length ? x.tiempos[i] : null;
      // sin informe de tiempo: diferencia entre los totales acumulados de dos cortes seguidos
      const p = x.historial?.find((h) => h.t === t), q = x.historial?.find((h) => h.t === t - 1);
      return p?.minutos != null ? (t === 1 ? p.minutos : q?.minutos != null ? Math.max(0, p.minutos - q.minutos) : null) : null;
    }
    const p = x.historial?.find((h) => h.t === t);
    return p ? p[k] : null;
  });
}
/** Número de trimestres a graficar */
export const nTrim = (xs: (ConHist)[]) => Math.max(0, ...xs.map((x) => Math.max(ultimoT(x), x.tiempos?.length ?? 0)));
/** Promedio por trimestre de varias series */
export const promedioQ = (series: (number | null)[][], n: number) => Array.from({ length: n }, (_, i) => {
  const v = series.map((s) => s[i]).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
});

/* ---------- utilidades ---------- */
export function fmtMin(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  if (m < 0) return "−" + fmtMin(-m);
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
