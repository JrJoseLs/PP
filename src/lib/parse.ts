/* Lectura de los Excel: informes del juego (icompetencyreport) y listados (ADM535).
   Portado de la versión anterior; el tipo de archivo se detecta solo. */
import type { RosterEntry, Resultado } from "./types";
import { METRICS_FALLBACK, nameKey, nameTokens, normText } from "./metrics";
import { isExample } from "./templates";

type Rows = unknown[][];

export async function readSheet(file: File): Promise<Rows> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true }) as Rows;
}

const cleanCode = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "number" ? String(Math.round(v)) : String(v).trim());
const round2 = (v: number) => Math.round(v * 100) / 100;
function normGroup(v: unknown) {
  const t = cleanCode(v).replace(/\s+/g, " ");
  const m = t.match(/^(?:grupo|secci[oó]n|g)\s*[-:#.]?\s*(.+)$/i);
  return (m ? m[1] : t).trim();
}

const KNOWN_METRICS = new Set(METRICS_FALLBACK.map(normText));

export function findRosterHeader(rows: Rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const n = (rows[i] ?? []).map(normText);
    // un informe con columna "Carrera" no es un listado: empieza por "Estudiante" y trae competencias
    if (n[0] === "ESTUDIANTE" && n.some((v) => KNOWN_METRICS.has(v))) return -1;
    if (n.includes("CARRERA") && n.some((v) => ["NOMBRE", "NOMBRES", "NOMBRE COMPLETO", "ESTUDIANTE"].includes(v))) return i;
  }
  return -1;
}

export function parseRoster(rows: Rows, headerIdx: number): RosterEntry[] {
  const h = rows[headerIdx].map(normText);
  const col = (...names: string[]) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; } return -1; };
  const cNombre = col("NOMBRE", "NOMBRES", "NOMBRE COMPLETO", "ESTUDIANTE");
  const cCarrera = col("CARRERA");
  const cId = col("ID", "MATRICULA", "ID ESTUDIANTE");
  const cGrupo = col("GRUPO", "RNC", "NRC", "SECCION");
  const get = (r: unknown[], c: number) => (c >= 0 ? cleanCode(r[c]) : "");
  const out: RosterEntry[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const nombre = String(r[cNombre] ?? "").replace(/\s+/g, " ").trim();
    if (!nombre || isExample(nombre)) continue;
    out.push({ matricula: get(r, cId), nombre, carrera: get(r, cCarrera).toUpperCase(), grupo: get(r, cGrupo) });
  }
  return out;
}

export interface ParsedReport { metrics: string[]; students: Omit<Resultado, "id" | "clase_id">[]; }

export function parseReport(rows: Rows): ParsedReport | null {
  const headerIdx = rows.findIndex((r) => r && normText(r[0]) === "ESTUDIANTE");
  if (headerIdx === -1) return null;
  const header = rows[headerIdx];
  let metricCols: { name: string; c: number }[] = [];
  let cCarrera = -1, cGrupo = -1, cMat = -1;
  for (let c = 2; c < header.length; c++) {
    const raw = header[c];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const n = normText(raw);
    if (n === "CARRERA") cCarrera = c;
    else if (["GRUPO", "SECCION", "NRC", "RNC"].includes(n)) cGrupo = c;
    else if (["ID", "MATRICULA"].includes(n)) cMat = c;
    else metricCols.push({ name: String(raw).trim(), c });
  }
  if (!metricCols.length) metricCols = METRICS_FALLBACK.map((m, i) => ({ name: m, c: 2 + i }));
  // La 2ª columna ("Empresa" en el software del juego) se usa para el grupo
  const col1Group = ["EMPRESA", "GRUPO", "SECCION", "NRC", "RNC"].includes(normText(header[1]));

  const students: ParsedReport["students"] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((v) => v === undefined || v === null || String(v).trim() === "")) continue;
    const col0 = String(r[0] ?? "").trim(), col1 = String(r[1] ?? "").trim();
    if (/fin de la hoja/i.test(col0)) break;
    if (/promedios del juego/i.test(col1) || /^informe/i.test(col0)) continue;
    if (!col0 || isExample(col0)) continue;
    students.push({
      nombre: col0.replace(/\s+/g, " "),
      valores: metricCols.map((m) => { const v = r[m.c]; const n = v === undefined || v === null || v === "" ? 0 : Number(v); return isNaN(n) ? 0 : round2(n); }),
      carrera: cCarrera >= 0 ? cleanCode(r[cCarrera]).toUpperCase() : "",
      grupo: cGrupo >= 0 ? normGroup(r[cGrupo]) : col1Group ? normGroup(col1) : "",
      matricula: cMat >= 0 ? cleanCode(r[cMat]) : "",
    });
  }
  return students.length ? { metrics: metricCols.map((m) => m.name), students } : null;
}

/** Empareja "APELLIDOS, NOMBRES" del informe con "NOMBRES APELLIDOS" del listado */
export function makeMatcher(roster: RosterEntry[]) {
  const idx = roster.map((r) => ({ r, toks: new Set(nameTokens(r.nombre)) }));
  const cache = new Map<string, RosterEntry | null>();
  return (nombre: string): RosterEntry | null => {
    const key = nameKey(nombre);
    if (cache.has(key)) return cache.get(key)!;
    const t = new Set(nameTokens(nombre));
    let best: RosterEntry | null = null, bestScore = 0, tie = false;
    if (t.size >= 2) for (const e of idx) {
      let inter = 0; t.forEach((x) => { if (e.toks.has(x)) inter++; });
      const minSize = Math.min(t.size, e.toks.size);
      if (!(inter >= 3 || (inter >= 2 && inter === minSize))) continue;
      const score = inter / (t.size + e.toks.size - inter);
      if (score > bestScore) { best = e.r; bestScore = score; tie = false; }
      else if (score === bestScore && e.r !== best) tie = true;
    }
    const res = best && !tie ? best : null;
    cache.set(key, res);
    return res;
  };
}

export function guessGroup(students: { grupo: string }[]) {
  const counts: Record<string, number> = {};
  students.forEach((s) => { if (s.grupo) counts[s.grupo] = (counts[s.grupo] ?? 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= students.length / 2 ? top[0] : "";
}
