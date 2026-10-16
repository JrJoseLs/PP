/* Lectura de los informes del juego (icompetencyreport). Los listados de estudiantes
   se leen en directory.ts, que reconoce sus columnas automáticamente. */
import type { Resultado } from "./types";
import { METRICS_FALLBACK, normText } from "./metrics";
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

export interface ParsedReport { metrics: string[]; students: Omit<Resultado, "id" | "clase_id">[]; }

export function parseReport(rows: Rows): ParsedReport | null {
  const headerIdx = rows.findIndex((r) => r && normText(r[0]) === "ESTUDIANTE");
  if (headerIdx === -1) return null;
  const header = rows[headerIdx];
  let metricCols: { name: string; c: number }[] = [];
  let cCarrera = -1, cGrupo = -1, cMat = -1, cEquipo = -1;
  for (let c = 2; c < header.length; c++) {
    const raw = header[c];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const n = normText(raw);
    if (n === "CARRERA") cCarrera = c;
    else if (["GRUPO", "SECCION", "NRC", "RNC"].includes(n)) cGrupo = c;
    else if (["ID", "MATRICULA"].includes(n)) cMat = c;
    else if (["EQUIPO", "TEAM", "EMPRESA"].includes(n)) cEquipo = c;
    else metricCols.push({ name: String(raw).trim(), c });
  }
  if (!metricCols.length) metricCols = METRICS_FALLBACK.map((m, i) => ({ name: m, c: 2 + i }));
  // La 2ª columna: "Empresa" en el juego = el EQUIPO del estudiante (ej. "STRYDE BIKES"),
  // o, en plantillas propias, el grupo / sección de clase
  const h1 = normText(header[1]);
  const col1Team = ["EMPRESA", "EQUIPO", "TEAM"].includes(h1);
  const col1Group = ["GRUPO", "SECCION", "NRC", "RNC"].includes(h1);

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
      equipo: (cEquipo >= 0 ? String(r[cEquipo] ?? "") : col1Team ? col1 : "").replace(/s+/g, " ").trim(),
      matricula: cMat >= 0 ? cleanCode(r[cMat]) : "",
    });
  }
  return students.length ? { metrics: metricCols.map((m) => m.name), students } : null;
}

export function guessGroup(students: { grupo: string }[]) {
  const counts: Record<string, number> = {};
  students.forEach((s) => { if (s.grupo) counts[s.grupo] = (counts[s.grupo] ?? 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= students.length / 2 ? top[0] : "";
}
