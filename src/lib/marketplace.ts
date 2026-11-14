/* Recepción de informes desde la extensión de Chrome «Marketplace - Exportador de Competencias».
   Protocolo (window.postMessage, solo dentro del mismo origen del comparador):
     página    → extensión  MARKETPLACE_JR_READY                 «la pantalla de importación está lista»
     extensión → página     MARKETPLACE_JR_IMPORT { payload }     payload = { requestId, filename, rows }
     página    → extensión  MARKETPLACE_JR_RECEIVED { requestId } «recibido, no lo vuelvas a enviar»
   Dos formas de payload:
     1) Informe de competencias:  { requestId, filename, rows }
        rows = [encabezados, ...una fila por estudiante]:
        Estudiante | Empresa (o "Grupo") | Matrícula | Carrera | 24 competencias (0–100)
     2) Informes del juego (v2): { requestId, filename, sheets: { "<hoja>": filas[][] , ... } }
        el libro tal cual: igrades (Desempeño por Equipos / por Jugadores) o itimespent (Tiempo Gastado…).
        filename debe ser el original de Marketplace («igrades-29740-00005-73609-q4.xlsx»): de ahí salen
        el código del juego (para unir informes y clases) y el trimestre.
   La página anuncia lo que acepta en READY: { version: 2, acepta: ["competencias", "igrades", "itimespent"] }.
   Nada se guarda aquí: todo entra como borrador en Importar y se revisa antes de guardar.
   Detalle para quien mantiene la extensión: docs/extension-marketplace.md */
import { normText } from "./metrics";
import { parseIgrades } from "./game";

export const MSG = { ready: "MARKETPLACE_JR_READY", import: "MARKETPLACE_JR_IMPORT", received: "MARKETPLACE_JR_RECEIVED" } as const;
/** Lo que la página anuncia a la extensión junto con READY */
export const READY_INFO = { version: 2, acepta: ["competencias", "igrades", "itimespent"] } as const;
const MAX_SHEETS = 12, MAX_COLS = 80, MAX_TEXT = 500;
const MAX_ROWS = 10000;

export interface Payload { requestId: string; filename: string; rows?: unknown[][]; sheets?: Record<string, unknown[][]>;
  /** Opcional: nombre de la clase en Marketplace («jser-MKTJun26»). Solo sugiere el destino. */
  clase?: string; }
export type Check = { ok: true; payload: Payload; tipo: "competencias" | "juego"; estudiantes: number } | { ok: false; error: string };

/** Libro del juego: solo texto, números o vacíos, con límites de tamaño */
function checkSheets(x: Payload): Check {
  const sh = x.sheets!;
  const names = Object.keys(sh);
  if (!names.length || names.length > MAX_SHEETS) return { ok: false, error: "El informe del juego recibido no tiene hojas válidas." };
  for (const n of names) {
    const rows = sh[n];
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return { ok: false, error: `La hoja «${n.slice(0, 40)}» tiene un formato desconocido.` };
    for (const r of rows) {
      if (!Array.isArray(r) || r.length > MAX_COLS) return { ok: false, error: `Filas con formato desconocido en «${n.slice(0, 40)}».` };
      if (r.some((v) => !(v === null || v === "" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= MAX_TEXT))))
        return { ok: false, error: `Valores no válidos en la hoja «${n.slice(0, 40)}».` };
    }
  }
  const g = parseIgrades(sh);
  if (!g) return { ok: false, error: "No reconocí el informe del juego recibido (se esperaba igrades o itimespent)." };
  return { ok: true, payload: x, tipo: "juego", estudiantes: g.jugadores.length };
}

/** Valida la forma y el contenido de lo que envía la extensión */
export function checkPayload(p: unknown): Check {
  const x = p as Partial<Payload> | null;
  if (!x || typeof x.requestId !== "string" || !x.requestId || typeof x.filename !== "string")
    return { ok: false, error: "La extensión envió datos con un formato desconocido." };
  if (x.sheets && typeof x.sheets === "object" && !Array.isArray(x.sheets)) return checkSheets(x as Payload);
  if (!Array.isArray(x.rows)) return { ok: false, error: "La extensión envió datos con un formato desconocido." };
  const [head, ...body] = x.rows;
  if (!Array.isArray(head) || head.length < 5 || normText(head[0]) !== "ESTUDIANTE")
    return { ok: false, error: "El informe recibido no tiene la columna «Estudiante»." };
  if (!body.length || body.length > MAX_ROWS) return { ok: false, error: `El informe recibido tiene ${body.length} filas de estudiantes.` };
  for (const r of body) {
    if (!Array.isArray(r) || r.length !== head.length) return { ok: false, error: "Hay filas incompletas en el informe recibido." };
    if (typeof r[0] !== "string" || !r[0].trim()) return { ok: false, error: "Hay estudiantes sin nombre en el informe recibido." };
    if (r.slice(4).some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100))
      return { ok: false, error: `Calificaciones fuera de 0–100 en «${r[0]}».` };
  }
  return { ok: true, payload: x as Payload, tipo: "competencias", estudiantes: body.length };
}

/** Convierte lo recibido en un archivo en memoria para el importador de siempre.
    La 2.ª columna de Marketplace es la EMPRESA del simulador = el equipo del juego. */
export async function payloadToFile(p: Payload): Promise<File> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  if (p.sheets) {
    // informe del juego: se rearma el libro con sus hojas, tal cual
    const usados = new Set<string>();
    Object.entries(p.sheets).forEach(([n, rows], i) => {
      let name = n.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Hoja";
      if (usados.has(name)) name = `${name} ${i + 1}`;
      usados.add(name);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    });
  } else {
    const rows = p.rows!.map((r) => [...r]);
    if (["GRUPO", "EMPRESA", "TEAM"].includes(normText(rows[0][1]))) rows[0][1] = "Equipo";
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Informe");
  }
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const name = p.filename.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "Informe_Marketplace.xlsx";
  return new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
