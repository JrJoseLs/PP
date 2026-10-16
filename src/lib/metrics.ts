import type { Clase, Resultado } from "./types";

/* Competencias "de riesgo": un valor ALTO es MALO. No entran en el índice general. */
const RISK = new Set(["MARGEN DE MEJORA", "OPORTUNIDAD PERDIDA", "FALTA DE PREVISION", "LUCHADO", "INSUFICIENTE", "RETRASAR"]);

export const METRICS_FALLBACK = [
  "Pensamiento Crítico", "Resolución de problemas", "Esfuerzo - Actividades", "Esfuerzo - Tiempo Invertido",
  "Razonamiento Inductivo", "Razonamiento Deductivo", "Agilidad de Aprendizaje", "Evaluación estratégica",
  "Analítica", "Evaluación", "Innovación", "Tenacidad", "Perseverancia", "Iniciativa", "Orientación a Resultados",
  "Excelencia Sostenida", "Margen de mejora", "Oportunidad Perdida", "Falta de Previsión", "Luchado",
  "Insuficiente", "Retrasar", "Resiliencia", "Fénix",
];

export function normText(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}
export const isRisk = (m: string) => RISK.has(normText(m));

export function mean(arr: (number | null | undefined)[]): number | null {
  let s = 0, n = 0;
  for (const v of arr) if (typeof v === "number" && !isNaN(v)) { s += v; n++; }
  return n ? s / n : null;
}
export function stdev(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = mean(arr)!;
  return Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / (arr.length - 1));
}

export function generalIndex(metrics: string[], valores: number[]): number | null {
  return mean(metrics.map((m, i) => (isRisk(m) ? null : valores[i])));
}

export interface Level { id: "bajo" | "medio" | "alto"; label: string; min: number; max: number; }
export const LEVELS: Level[] = [
  { id: "bajo", label: "Bajo", min: -Infinity, max: 34 },
  { id: "medio", label: "Medio", min: 34, max: 66 },
  { id: "alto", label: "Alto", min: 66, max: Infinity },
];
export function levelOf(v: number | null | undefined): Level | null {
  if (v === null || v === undefined || isNaN(v)) return null;
  return LEVELS.find((l) => v >= l.min && v < l.max) ?? null;
}
/** Nivel de una competencia concreta: en las de riesgo se interpreta al revés */
export function metricLevel(m: string, v: number | null | undefined) {
  if (v === null || v === undefined) return null;
  return levelOf(isRisk(m) ? 100 - v : v);
}

export const fmt = (n: number | null | undefined, d = 1) => (n === null || n === undefined || isNaN(n) ? "—" : n.toFixed(d));
export const fmtDiff = (n: number | null | undefined) => (n === null || n === undefined ? "" : (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1));
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Fila enriquecida: un resultado + su clase + datos calculados una sola vez */
export interface Row {
  r: Resultado;
  cls: Clase;
  indice: number | null;
  carrera: string;     // etiqueta visible
  grupo: string;
  equipo: string;     // equipo dentro del juego ("" si no se sabe)
  q: string;           // texto de búsqueda
}
export const SIN_CARRERA = "Sin carrera";
export const SIN_GRUPO = "Sin grupo";

export function metricValue(row: Row, m: string): number | null {
  const i = row.cls.metrics.indexOf(m);
  return i >= 0 ? row.r.valores[i] ?? null : null;
}
export function avgOf(rows: Row[], m: string) { return mean(rows.map((r) => metricValue(r, m))); }
export function avgIndex(rows: Row[]) { return mean(rows.map((r) => r.indice)); }
export function avgVector(rows: Row[], metrics: string[]) { return metrics.map((m) => avgOf(rows, m)); }

export function unionMetrics(clases: Clase[]): string[] {
  const out: string[] = [];
  clases.forEach((c) => c.metrics.forEach((m) => { if (!out.includes(m)) out.push(m); }));
  return out;
}
/** Competencias que casi nadie activa (p.ej. "Fénix": 0 en la mayoría) no dicen nada como fortaleza */
export function sparseMetrics(rows: Row[], metrics: string[]): Set<string> {
  return new Set(metrics.filter((m) => {
    const v = rows.map((r) => metricValue(r, m)).filter((x): x is number => x !== null);
    return v.length > 0 && v.filter((x) => x === 0).length / v.length >= 0.7;
  }));
}
/** Para el radar: "más afuera = mejor" (las de riesgo se invierten) */
export const outward = (m: string, v: number | null) => (v === null ? null : isRisk(m) ? 100 - v : v);

export function levelCounts(rows: Row[]) {
  const c = { bajo: 0, medio: 0, alto: 0, total: 0 };
  rows.forEach((r) => { const l = levelOf(r.indice); if (l) { c[l.id]++; c.total++; } });
  return c;
}

/** Clave estable de una persona para encontrarla en varias clases */
export function personKey(r: Resultado) {
  return r.matricula ? "m:" + r.matricula : "n:" + nameKey(r.nombre);
}
const NAME_STOP = new Set(["DE", "LA", "LOS", "LAS", "DEL", "Y"]);
export function nameTokens(s: string) { return normText(s).split(" ").filter((t) => t.length > 1 && !NAME_STOP.has(t)); }
export function nameKey(s: string) { return nameTokens(s).sort().join(" "); }

export function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s,.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}
/** "PEREZ GOMEZ, JUAN CARLOS" → "Juan Carlos Pérez Gómez" (sin tocar acentos que ya existan) */
export function displayName(s: string) {
  const t = s.includes(",") ? s.split(",").map((x) => x.trim()).reverse().join(" ") : s;
  return titleCase(t.replace(/\s+/g, " ").trim());
}
export function initials(s: string) {
  const p = displayName(s).split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
