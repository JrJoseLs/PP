/* Nombres visibles de la plataforma, configurables por administración (Ajustes).
   - Roles: internamente siguen siendo "decano" y "maestro" (base de datos y permisos);
     aquí solo se decide cómo se llaman en pantalla.
   - Competencias: los informes del juego traen nombres traducidos de forma literal
     ("Luchado", "Retrasar"…). Se muestran con un nombre en español académico,
     sin tocar los datos: los Excel se siguen leyendo y exportando con el nombre original. */
import type { Rol } from "./types";
import { normText } from "./metrics";

export interface RoleName { one: string; many: string; }
export interface RoleNames { decano: RoleName; maestro: RoleName; }

export const ROLE_PRESETS: { id: string; titulo: string; nota: string; names: RoleNames }[] = [
  { id: "academico", titulo: "Director/Coordinador académico · Docente", nota: "Recomendado: los cargos de la institución",
    names: { decano: { one: "Director/Coordinador académico", many: "Directores y coordinadores" }, maestro: { one: "Docente", many: "Docentes" } } },
  { id: "supervisor", titulo: "Supervisor/a · Colaborador/a", nota: "Genérico, sirve para cualquier institución",
    names: { decano: { one: "Supervisor/a", many: "Supervisores" }, maestro: { one: "Colaborador/a", many: "Colaboradores" } } },
  { id: "coordinador", titulo: "Coordinador/a · Docente", nota: "Habitual en universidades",
    names: { decano: { one: "Coordinador/a", many: "Coordinadores" }, maestro: { one: "Docente", many: "Docentes" } } },
  { id: "responsable", titulo: "Responsable · Observador/a", nota: "Centrado en quién gestiona y quién consulta",
    names: { decano: { one: "Responsable", many: "Responsables" }, maestro: { one: "Observador/a", many: "Observadores" } } },
  { id: "decano", titulo: "Decano/a · Maestro/a", nota: "Los nombres originales",
    names: { decano: { one: "Decano/a", many: "Decanos" }, maestro: { one: "Maestro/a", many: "Maestros" } } },
];
export const DEFAULT_ROLES = ROLE_PRESETS[0].names;

let roles: RoleNames = DEFAULT_ROLES;
export function setRoleNames(r?: Partial<RoleNames> | null) {
  const clean = (x: Partial<RoleName> | undefined, d: RoleName): RoleName =>
    ({ one: x?.one?.trim() || d.one, many: x?.many?.trim() || d.many });
  roles = { decano: clean(r?.decano, DEFAULT_ROLES.decano), maestro: clean(r?.maestro, DEFAULT_ROLES.maestro) };
}
export const roleNames = () => roles;
/* ---------- Cargos y permisos ----------
   Administración define los cargos (Ajustes) y a qué NIVEL DE ACCESO corresponde cada uno.
   Los niveles son los permisos reales (los aplica la base de datos); el cargo es el nombre que se ve. */
export interface Cargo { label: string; rol: Rol; }
export const NIVELES: Record<Rol, { titulo: string; nota: string }> = {
  admin: { titulo: "Acceso total", nota: "Carga clases, crea cuentas, define cargos y decide quién ve cada clase" },
  decano: { titulo: "Gestiona clases", nota: "Ve las clases que administración le asigna y las reparte a su equipo" },
  maestro: { titulo: "Ve sus clases", nota: "Ve solo las clases que se le asignan" },
};
export const CARGOS_BASE: Cargo[] = [
  { label: "Administración", rol: "admin" },
  { label: "Director/Coordinador académico", rol: "decano" },
  { label: "Docente", rol: "maestro" },
  { label: "Docente invitado", rol: "maestro" },
  { label: "Facilitador/Mentor", rol: "maestro" },
  { label: "Investigador", rol: "maestro" },
];
let cargos: Cargo[] = CARGOS_BASE;
/** Carga los cargos guardados en Ajustes (si no hay o están mal formados, los de base) */
export function setCargos(list?: unknown) {
  const ok = Array.isArray(list) ? list.filter((c): c is Cargo => !!c && typeof c.label === "string" && !!c.label.trim() && ["admin", "decano", "maestro"].includes(c.rol))
    .map((c) => ({ label: c.label.trim().slice(0, 60), rol: c.rol })) : [];
  cargos = ok.some((c) => c.rol === "admin") ? ok : CARGOS_BASE;
}
export const cargosList = () => cargos;
/** Cargo de una persona: el guardado; si no tiene, el nombre de su nivel */
export function cargoDe(p: { rol: Rol; cargo?: string | null }) { return p.cargo?.trim() || rolLabel(p.rol); }
/** Nivel de acceso de un cargo */
export const cargoRol = (label: string): Rol => cargos.find((c) => c.label === label)?.rol ?? "maestro";

/** Rol con mayúscula inicial ("Supervisor/a") */
export const rolLabel = (r: Rol) => (r === "admin" ? "Administración" : roles[r].one);
/** Atajos: D = quien reparte clases (decano), M = quien las consulta (maestro) */
export const D = () => roles.decano;
export const M = () => roles.maestro;
/** Para usar dentro de una frase: "sin supervisor/a" */
export const low = (s: string) => s.toLowerCase();

/* ---------- Competencias ---------- */
interface MetricInfo { nombre: string; desc: string; }
const METRICS: Record<string, MetricInfo> = {
  "PENSAMIENTO CRITICO": { nombre: "Pensamiento crítico", desc: "Analiza información y argumentos antes de decidir." },
  "RESOLUCION DE PROBLEMAS": { nombre: "Resolución de problemas", desc: "Encuentra soluciones eficaces ante situaciones nuevas." },
  "ESFUERZO ACTIVIDADES": { nombre: "Esfuerzo: actividades realizadas", desc: "Cantidad de actividades que completó." },
  "ESFUERZO TIEMPO INVERTIDO": { nombre: "Esfuerzo: tiempo dedicado", desc: "Tiempo que dedicó a las actividades." },
  "RAZONAMIENTO INDUCTIVO": { nombre: "Razonamiento inductivo", desc: "Obtiene reglas generales a partir de casos concretos." },
  "RAZONAMIENTO DEDUCTIVO": { nombre: "Razonamiento deductivo", desc: "Aplica reglas generales para llegar a conclusiones." },
  "AGILIDAD DE APRENDIZAJE": { nombre: "Agilidad de aprendizaje", desc: "Aprende rápido de la experiencia y se adapta." },
  "EVALUACION ESTRATEGICA": { nombre: "Pensamiento estratégico", desc: "Valora escenarios y planifica con visión de conjunto." },
  "ANALITICA": { nombre: "Capacidad analítica", desc: "Descompone los problemas y razona con datos." },
  "EVALUACION": { nombre: "Capacidad de evaluación", desc: "Juzga opciones y resultados con criterio." },
  "INNOVACION": { nombre: "Innovación", desc: "Propone ideas y enfoques nuevos." },
  "TENACIDAD": { nombre: "Tenacidad", desc: "Mantiene el esfuerzo cuando la tarea se complica." },
  "PERSEVERANCIA": { nombre: "Perseverancia", desc: "Insiste hasta completar lo que empieza." },
  "INICIATIVA": { nombre: "Iniciativa", desc: "Actúa por cuenta propia sin esperar indicaciones." },
  "ORIENTACION A RESULTADOS": { nombre: "Orientación a resultados", desc: "Se enfoca en cumplir los objetivos." },
  "EXCELENCIA SOSTENIDA": { nombre: "Excelencia sostenida", desc: "Mantiene un alto nivel de forma constante." },
  "MARGEN DE MEJORA": { nombre: "Margen de mejora", desc: "Distancia entre su desempeño y el esperado. Menos es mejor." },
  "OPORTUNIDAD PERDIDA": { nombre: "Oportunidades desaprovechadas", desc: "Ocasiones de avanzar que dejó pasar. Menos es mejor." },
  "FALTA DE PREVISION": { nombre: "Falta de planificación", desc: "Actúa sin anticipar las consecuencias. Menos es mejor." },
  "LUCHADO": { nombre: "Dificultad persistente", desc: "Se estancó repetidamente en las mismas tareas. Menos es mejor." },
  "INSUFICIENTE": { nombre: "Desempeño insuficiente", desc: "Resultados por debajo del mínimo esperado. Menos es mejor." },
  "RETRASAR": { nombre: "Postergación de tareas", desc: "Tiende a aplazar lo que debe hacer. Menos es mejor." },
  "RESILIENCIA": { nombre: "Resiliencia", desc: "Se repone de los errores y sigue adelante." },
  "FENIX": { nombre: "Superación", desc: "Remonta tras un mal resultado y termina con éxito." },
};

let metricOverrides: Record<string, string> = {};
export function setMetricNames(o?: Record<string, string> | null) {
  metricOverrides = {};
  Object.entries(o ?? {}).forEach(([k, v]) => { if (typeof v === "string" && v.trim()) metricOverrides[normText(k)] = v.trim(); });
}
export const metricOverridesRaw = () => metricOverrides;
/** Nombre visible de una competencia (el original se mantiene en los datos) */
export function metricName(m: string) { const k = normText(m); return metricOverrides[k] || METRICS[k]?.nombre || m; }
/** Nombre sugerido por la plataforma (sin personalización) */
export function metricDefaultName(m: string) { return METRICS[normText(m)]?.nombre || m; }
export function metricDesc(m: string) { return METRICS[normText(m)]?.desc ?? ""; }
