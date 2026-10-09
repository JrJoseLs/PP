/* Agrupaciones para comparar: por clase, maestro, decano, carrera o grupo */
import type { Clase, Profile } from "./types";
import { avgIndex, avgVector, levelCounts, type Row } from "./metrics";

export interface Group { id: string; kind: "clase" | "maestro" | "decano" | "carrera" | "grupo" | "todos" | "estudiante"; label: string; sub?: string; color: string; rows: Row[]; }

export const SERIES_COLORS = ["#0a84ff", "#ff9f0a", "#30d158", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#5e5ce6", "#ac8e68", "#ff6482"];

export function byClase(clases: Clase[], rowsByClase: Map<string, Row[]>): Group[] {
  return clases.map((c) => ({ id: "clase:" + c.id, kind: "clase" as const, label: c.nombre, sub: "Grupo " + (c.grupo || "—"), color: c.color, rows: rowsByClase.get(c.id) ?? [] }));
}
export function byMaestro(profiles: Profile[], clases: Clase[], rowsByClase: Map<string, Row[]>): Group[] {
  return profiles.filter((p) => p.rol === "maestro").map((p, i) => {
    const cs = clases.filter((c) => c.maestros.includes(p.id));
    return { id: "maestro:" + p.id, kind: "maestro" as const, label: p.nombre, sub: cs.length === 1 ? cs[0].nombre : cs.length + " clases",
      color: SERIES_COLORS[i % SERIES_COLORS.length], rows: cs.flatMap((c) => rowsByClase.get(c.id) ?? []) };
  });
}
export function byDecano(profiles: Profile[], clases: Clase[], rowsByClase: Map<string, Row[]>): Group[] {
  return profiles.filter((p) => p.rol === "decano").map((p, i) => {
    const cs = clases.filter((c) => c.decanos.includes(p.id));
    return { id: "decano:" + p.id, kind: "decano" as const, label: p.nombre, sub: cs.length + " clases",
      color: SERIES_COLORS[(i + 3) % SERIES_COLORS.length], rows: cs.flatMap((c) => rowsByClase.get(c.id) ?? []) };
  });
}
export function byField(rows: Row[], field: "carrera" | "grupo"): Group[] {
  const map = new Map<string, Row[]>();
  rows.forEach((r) => { const k = r[field]; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true })).map(([k, rr], i) => ({
    id: field + ":" + k, kind: field, label: (field === "grupo" ? "Grupo " : "") + k, sub: rr.length + " estudiantes",
    color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length], rows: rr,
  }));
}

export function summarize(g: Group, metrics: string[]) {
  return { ...g, n: g.rows.length, indice: avgIndex(g.rows), levels: levelCounts(g.rows), vector: avgVector(g.rows, metrics) };
}
