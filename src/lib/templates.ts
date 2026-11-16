/* Plantillas Excel para descargar, editar y volver a subir.
   - Informe de competencias: una fila por estudiante (mismo formato que lee "Importar")
   - Listado de estudiantes: matrícula, nombre, carrera, grupo
   - Cuentas: para crear decanos y maestros en bloque
   Las filas cuyo nombre empieza por "EJEMPLO" se ignoran al importar. */
import type { Clase, Profile, Resultado, Rol, RosterEntry } from "./types";
import { METRICS_FALLBACK, isRisk, normText } from "./metrics";
import { D, M, low } from "./labels";

type XLSXMod = typeof import("xlsx");
type Cell = string | number | null;

async function xlsx(): Promise<XLSXMod> { return import("xlsx"); }

function sheet(X: XLSXMod, rows: Cell[][], widths: number[]) {
  const ws = X.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  return ws;
}
function save(X: XLSXMod, sheets: [string, ReturnType<typeof sheet>][], file: string) {
  const wb = X.utils.book_new();
  sheets.forEach(([n, ws]) => X.utils.book_append_sheet(wb, ws, n));
  X.writeFile(wb, file);
}
export const isExample = (s: unknown) => /^\s*ejemplo\b/i.test(String(s ?? ""));
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "clase";

/* ---------- Informe de competencias ---------- */
const REPORT_HEAD = ["Estudiante", "Equipo", "Grupo", "Matrícula", "Carrera"];

function reportInstructions(metrics: string[]): Cell[][] {
  return [
    ["Cómo llenar el informe de competencias"],
    [],
    ["1", "Escribe una fila por estudiante en la hoja «Informe», debajo de los encabezados."],
    ["2", "Estudiante: «APELLIDOS, NOMBRES» o «Nombres Apellidos». Es obligatorio."],
    ["3", "Equipo (la columna «Empresa» del juego), Grupo, Matrícula y Carrera son opcionales: lo que falte se completa con el directorio de estudiantes."],
    ["4", "Cada competencia va de 0 a 100. Una celda vacía cuenta como 0."],
    ["5", "No cambies los nombres de las competencias. Puedes quitar columnas que no uses o agregar nuevas al final."],
    ["6", "Las filas que empiezan por «EJEMPLO» se ignoran: bórralas o déjalas."],
    ["7", "Guarda el archivo con el nombre de la clase (ej. «Gestión de Proyectos.xlsx») y súbelo en Importar."],
    [],
    ["Competencias de riesgo (un valor más BAJO es mejor; no cuentan en el índice general):"],
    ...metrics.filter(isRisk).map((m) => ["", m] as Cell[]),
  ];
}

export async function downloadReportTemplate() {
  const X = await xlsx();
  const m = METRICS_FALLBACK;
  const ex = (nombre: string, base: number): Cell[] => [nombre, "STRYDE BIKES", "1593", "", "ISO", ...m.map((x, i) =>
    /F[ÉE]NIX/i.test(x) ? 0 : isRisk(x) ? Math.max(0, 100 - base - (i % 5) * 4) : Math.min(100, base + ((i * 7) % 15)))];
  const rows: Cell[][] = [REPORT_HEAD.concat(m), ex("EJEMPLO, ESTUDIANTE UNO", 62), ex("EJEMPLO, ESTUDIANTE DOS", 45)];
  save(X, [["Informe", sheet(X, rows, [32, 18, 9, 12, 10, ...m.map((x) => Math.max(10, Math.min(22, x.length + 2)))])],
    ["Instrucciones", sheet(X, reportInstructions(m), [4, 110])]], "plantilla-informe-competencias.xlsx");
}

/** Descarga una clase con el mismo formato de la plantilla (para editarla y volver a subirla) */
export async function downloadClase(c: Clase, resultados: Resultado[]) {
  const X = await xlsx();
  const rows: Cell[][] = [REPORT_HEAD.concat(c.metrics), ...resultados.map((r) =>
    [r.nombre, r.equipo ?? "", r.grupo || c.grupo, r.matricula, r.carrera, ...c.metrics.map((_, i) => r.valores[i] ?? null)] as Cell[])];
  save(X, [["Informe", sheet(X, rows, [32, 18, 9, 12, 10, ...c.metrics.map((x) => Math.max(10, Math.min(22, x.length + 2)))])],
    ["Instrucciones", sheet(X, reportInstructions(c.metrics), [4, 110])]], safeName(c.nombre) + ".xlsx");
}

/* ---------- Directorio de estudiantes ---------- */
const DIR_HEAD = ["Matrícula", "Nombres", "Apellidos", "Carrera", "Grupo", "Equipo del juego", "Correo", "Licencia del juego"];
const DIR_WIDTH = [14, 24, 26, 12, 9, 20, 30, 18];
function dirHelp(): Cell[][] {
  return [["Directorio de estudiantes"], [],
    ["Matrícula", "ID del estudiante en la institución (ej. A00123427). Es la forma más segura de unir datos."],
    ["Nombres / Apellidos", "Obligatorio al menos uno. También vale una sola columna «Nombre completo» en cualquier orden."],
    ["Carrera", "Código o nombre de la carrera (ej. ISO, ADM, FINANZAS)."],
    ["Grupo", "Grupo o sección de clase (ej. 1593)."],
    ["Equipo del juego", "Equipo en el simulador (la columna «Empresa» del informe, ej. STRYDE BIKES). Ayuda a enlazar."],
    ["Correo / Licencia", "Opcionales. Sirven para reconocer a la misma persona en listados del juego."],
    [],
    ["", "Puedes subir este archivo tal cual, o cualquier otro listado (ADM535, lista del juego con License number / Team / First name…)."],
    ["", "La app reconoce las columnas sola y une a cada persona por matrícula, licencia, correo o nombre."],
    ["", "Las contraseñas y teléfonos se ignoran siempre. Las filas que empiezan por «EJEMPLO» también."]];
}
export async function downloadRosterTemplate() {
  const X = await xlsx();
  const rows: Cell[][] = [DIR_HEAD,
    ["A00123427", "EJEMPLO Ana María", "Pérez Gómez", "ISO", "1593", "STRYDE BIKES", "ana.perez@universidad.edu", ""],
    ["", "EJEMPLO Luis Carlos", "Ramírez Díaz", "", "", "BIKING", "", "LIC-00231"]];
  save(X, [["Directorio", sheet(X, rows, DIR_WIDTH)], ["Instrucciones", sheet(X, dirHelp(), [20, 100])]], "plantilla-directorio-estudiantes.xlsx");
}
/** Descarga el directorio (o solo los incompletos) con el mismo formato, para completarlo y volver a subirlo */
export async function downloadDirectory(list: RosterEntry[], soloIncompletos = false) {
  const X = await xlsx();
  const sel = soloIncompletos ? list.filter((e) => !e.carrera || !e.matricula || !e.grupo) : list;
  const rows: Cell[][] = [DIR_HEAD, ...sel.map((e) => [e.matricula, e.nombre, "", e.carrera, e.grupo, e.equipo ?? "", e.email ?? "", e.licencia ?? ""] as Cell[])];
  save(X, [["Directorio", sheet(X, rows, DIR_WIDTH)], ["Instrucciones", sheet(X, dirHelp(), [20, 100])]],
    soloIncompletos ? "directorio-por-completar.xlsx" : "directorio-estudiantes.xlsx");
}

/* ---------- Cuentas de usuario ---------- */
export interface AccountRow { fila: number; nombre: string; usuario: string; rol: Rol; decano: string; password: string; error?: string; decano_id?: string | null; }

export async function downloadAccountsTemplate(isAdmin: boolean, decanos: Profile[]) {
  const X = await xlsx();
  const rows: Cell[][] = isAdmin
    ? [["Nombre", "Usuario", "Rol", `${D().one} (usuario)`, "Contraseña"],
       ["EJEMPLO Ana Morales", "ana.morales", low(D().one), "", ""],
       ["EJEMPLO Luis García", "luis.garcia", low(M().one), decanos[0]?.usuario ?? "ana.morales", ""]]
    : [["Nombre", "Usuario", "Contraseña"], ["EJEMPLO Luis García", "luis.garcia", ""]];
  const help: Cell[][] = [["Crear cuentas en bloque"], [],
    ["Nombre", "Nombre completo como se mostrará en la app."],
    ["Usuario", "Con lo que la persona inicia sesión: minúsculas, números, punto o guion (ej. laura.silva). Si lo dejas vacío se genera del nombre."],
    ...(isAdmin ? [["Rol", `admin, ${low(D().one)} o ${low(M().one)}.`], [`${D().one} (usuario)`, `Solo para ${low(M().many)}: el usuario de su ${low(D().one)}. Puede ser alguien creado en este mismo archivo.`]] as Cell[][] : []),
    ["Contraseña", "Opcional (mínimo 8). Si la dejas vacía se genera una segura."], [],
    ["", "Al terminar podrás descargar un Excel con los usuarios y contraseñas para entregarlos."],
    ["", "Las filas que empiezan por «EJEMPLO» se ignoran."],
    ...(isAdmin && decanos.length ? [[], [`${D().many} existentes:`], ...decanos.map((d) => ["", `${d.usuario}  (${d.nombre})`] as Cell[])] : [])];
  save(X, [["Cuentas", sheet(X, rows, isAdmin ? [30, 18, 10, 18, 14] : [30, 18, 14])], ["Instrucciones", sheet(X, help, [18, 100])]], "plantilla-cuentas.xlsx");
}

export function slugUser(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^(dra?|mtro|mtra|lic|ing)\.?\s+/, "").trim()
    .split(/\s+/).slice(0, 2).join(".").replace(/[^a-z0-9.]/g, "");
}
export function genPassword() {
  const a = "abcdefghjkmnpqrstuvwxyz", A = "ABCDEFGHJKLMNPQRSTUVWXYZ", d = "23456789";
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return Array.from({ length: 4 }, () => pick(A) + pick(a)).join("") + pick(d) + pick(d);
}

export async function parseAccounts(file: File, isAdmin: boolean): Promise<AccountRow[]> {
  const X = await xlsx();
  const wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const rows = X.utils.sheet_to_json<Cell[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const hi = rows.findIndex((r) => r && r.map(normText).includes("NOMBRE"));
  if (hi < 0) throw new Error("No encontré la columna «Nombre». Usa la plantilla de cuentas.");
  const h = rows[hi].map(normText);
  const col = (...n: string[]) => n.map((x) => h.indexOf(x)).find((i) => i >= 0) ?? -1;
  const cN = col("NOMBRE"), cU = col("USUARIO"), cR = col("ROL"), cD = h.findIndex((x, i) => i !== cU && i !== cN && (x.startsWith("DECANO") || x.startsWith(normText(D().one).split(" ")[0]) || (x.includes("USUARIO") && x !== "USUARIO"))), cP = col("CONTRASENA", "PASSWORD");
  const out: AccountRow[] = [];
  rows.slice(hi + 1).forEach((r, i) => {
    const get = (c: number) => (c >= 0 && r?.[c] != null ? String(r[c]).trim() : "");
    const nombre = get(cN);
    if (!nombre || isExample(nombre)) return;
    const rolTxt = normText(get(cR)).toLowerCase();
    // acepta el nombre configurado (ej. "supervisor/a") o el original ("decano")
    const dWord = normText(D().one).toLowerCase().split(" ")[0];
    const rol: Rol = !isAdmin ? "maestro" : rolTxt.startsWith("adm") ? "admin" : rolTxt.startsWith("dec") || (!!dWord && rolTxt.startsWith(dWord)) ? "decano" : "maestro";
    const row: AccountRow = { fila: hi + i + 2, nombre, usuario: (get(cU) || slugUser(nombre)).toLowerCase(), rol, decano: get(cD).toLowerCase(), password: get(cP) || genPassword() };
    if (!/^[a-z0-9._-]{3,}$/.test(row.usuario)) row.error = "Usuario inválido";
    else if (row.password.length < 8) row.error = "Contraseña de menos de 8 caracteres";
    out.push(row);
  });
  const seen = new Set<string>();
  out.forEach((r) => { if (seen.has(r.usuario) && !r.error) r.error = "Usuario repetido en el archivo"; seen.add(r.usuario); });
  return out;
}

export async function downloadCredentials(rows: AccountRow[]) {
  const X = await xlsx();
  const data: Cell[][] = [["Nombre", "Usuario", "Contraseña", "Rol", "Dirección"], ...rows.map((r) => [r.nombre, r.usuario, r.password, r.rol, location.origin + location.pathname] as Cell[])];
  save(X, [["Credenciales", sheet(X, data, [30, 18, 14, 10, 40])]], `credenciales-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
