/* Recepción de informes desde la extensión de Chrome «Marketplace - Exportador de Competencias».
   Protocolo (window.postMessage, solo dentro del mismo origen del comparador):
     página    → extensión  MARKETPLACE_JR_READY                 «la pantalla de importación está lista»
     extensión → página     MARKETPLACE_JR_IMPORT { payload }     payload = { requestId, filename, rows }
     página    → extensión  MARKETPLACE_JR_RECEIVED { requestId } «recibido, no lo vuelvas a enviar»
   rows = [encabezados, ...una fila por estudiante], con el mismo formato que el informe del juego:
     Estudiante | Empresa (o "Grupo") | Matrícula | Carrera | 24 competencias (0–100)
   Nada se guarda aquí: el informe entra como borrador en Importar y se revisa antes de guardar. */
import { normText } from "./metrics";

export const MSG = { ready: "MARKETPLACE_JR_READY", import: "MARKETPLACE_JR_IMPORT", received: "MARKETPLACE_JR_RECEIVED" } as const;
const MAX_ROWS = 10000;

export interface Payload { requestId: string; filename: string; rows: unknown[][]; }
export type Check = { ok: true; payload: Payload; estudiantes: number } | { ok: false; error: string };

/** Valida la forma y el contenido de lo que envía la extensión */
export function checkPayload(p: unknown): Check {
  const x = p as Partial<Payload> | null;
  if (!x || typeof x.requestId !== "string" || !x.requestId || typeof x.filename !== "string" || !Array.isArray(x.rows))
    return { ok: false, error: "La extensión envió datos con un formato desconocido." };
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
  return { ok: true, payload: x as Payload, estudiantes: body.length };
}

/** Convierte lo recibido en un archivo en memoria para el importador de siempre.
    La 2.ª columna de Marketplace es la EMPRESA del simulador = el equipo del juego. */
export async function payloadToFile(p: Payload): Promise<File> {
  const rows = p.rows.map((r) => [...r]);
  if (["GRUPO", "EMPRESA", "TEAM"].includes(normText(rows[0][1]))) rows[0][1] = "Equipo";
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Informe");
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const name = p.filename.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "Informe_Marketplace.xlsx";
  return new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
