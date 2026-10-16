/* Ámbito de análisis: un filtro compartido por Inicio, Estudiantes y Comparar.
   - Facetas encadenadas: las opciones de cada filtro salen de los estudiantes que cumplen
     los DEMÁS filtros (elegir una clase deja solo sus carreras, grupos y equipos).
   - Dentro de un mismo filtro los valores se suman (clase A o clase B);
     entre filtros distintos se cruzan (clase A y carrera ISO).
   - Se recuerda por usuario mientras navega. */
import { useMemo, useSyncExternalStore } from "react";
import { useApp } from "../data/store";
import { levelOf, normText, type Row } from "./metrics";
import type { Clase } from "./types";

export type Facet = "clase" | "carrera" | "grupo" | "equipo" | "nivel";
export const FACETS: Facet[] = ["clase", "carrera", "grupo", "equipo", "nivel"];
export const FACET_LABEL: Record<Facet, string> = { clase: "Clase", carrera: "Carrera", grupo: "Grupo", equipo: "Equipo", nivel: "Nivel" };
export type Scope = Record<Facet, string[]> & { q: string };
export const EMPTY_SCOPE: Scope = { clase: [], carrera: [], grupo: [], equipo: [], nivel: [], q: "" };
const NIVEL: Record<string, string> = { alto: "Alto", medio: "Medio", bajo: "Bajo" };

export const facetValue = (r: Row, f: Facet): string =>
  f === "clase" ? r.cls.id : f === "nivel" ? levelOf(r.indice)?.id ?? "" : r[f];
export function facetLabel(f: Facet, v: string, clases: Clase[]) {
  if (f === "clase") return clases.find((c) => c.id === v)?.nombre ?? "Clase eliminada";
  if (f === "nivel") return NIVEL[v] ?? v;
  if (f === "grupo") return "Grupo " + v;
  return v;
}
export const scopeActive = (s: Scope) => !!s.q.trim() || FACETS.some((f) => s[f].length > 0);
export const scopeCount = (s: Scope) => FACETS.reduce((n, f) => n + s[f].length, 0) + (s.q.trim() ? 1 : 0);

/** Filas que cumplen el ámbito (opcionalmente ignorando un filtro, para calcular sus opciones) */
export function applyScope(rows: Row[], s: Scope, except?: Facet): Row[] {
  const q = normText(s.q);
  const active = FACETS.filter((f) => f !== except && s[f].length);
  if (!active.length && !q) return rows;
  const sets = active.map((f) => [f, new Set(s[f])] as const);
  return rows.filter((r) => sets.every(([f, set]) => set.has(facetValue(r, f))) && (!q || r.q.includes(q)));
}

export interface Option { value: string; label: string; count: number; }
/** Opciones de un filtro con su número de estudiantes, según los demás filtros activos */
export function facetOptions(rows: Row[], s: Scope, f: Facet, clases: Clase[]): Option[] {
  const counts = new Map<string, number>();
  applyScope(rows, s, f).forEach((r) => { const v = facetValue(r, f); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); });
  s[f].forEach((v) => { if (!counts.has(v)) counts.set(v, 0); });   // lo elegido sigue visible para poder quitarlo
  const order = f === "nivel" ? ["alto", "medio", "bajo"] : null;
  return [...counts.entries()].map(([value, count]) => ({ value, count, label: facetLabel(f, value, clases) }))
    .sort((a, b) => order ? order.indexOf(a.value) - order.indexOf(b.value) : a.label.localeCompare(b.label, "es", { numeric: true }));
}

/* ---------- estado compartido entre páginas ---------- */
let current: Scope = EMPTY_SCOPE;
let currentKey = "";
const listeners = new Set<() => void>();
function load(key: string) {
  if (key === currentKey) return;
  currentKey = key;
  try { const v = JSON.parse(sessionStorage.getItem(key) || "null"); current = v ? { ...EMPTY_SCOPE, ...v } : EMPTY_SCOPE; } catch { current = EMPTY_SCOPE; }
}
export function setScope(next: Scope) {
  current = next;
  try { sessionStorage.setItem(currentKey, JSON.stringify(next)); } catch { /* */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** Ámbito actual + datos ya filtrados, listos para cualquier página */
export function useScoped() {
  const app = useApp();
  load("pp_scope_" + (app.user?.id ?? ""));
  const scope = useSyncExternalStore(subscribe, () => current);
  return useMemo(() => {
    const rows = applyScope(app.rows, scope);
    const rowsByClase = new Map<string, Row[]>();
    rows.forEach((r) => { if (!rowsByClase.has(r.cls.id)) rowsByClase.set(r.cls.id, []); rowsByClase.get(r.cls.id)!.push(r); });
    const active = scopeActive(scope);
    const clases = active ? app.snap.clases.filter((c) => rowsByClase.has(c.id)) : app.snap.clases;
    return { scope, setScope, active, rows, rowsByClase, clases, allRows: app.rows };
  }, [app.rows, app.snap.clases, scope]);
}
