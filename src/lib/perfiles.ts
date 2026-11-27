/* CRR ponderado por carrera.
   Cada carrera reparte 100 puntos entre las 24 competencias. El CRR de un estudiante es el promedio
   ponderado de sus competencias con los pesos de SU carrera; las de riesgo (↓) entran invertidas
   (100 − valor), porque en ellas menos es mejor. Si una competencia no está en la clase o está casi
   vacía, su peso se reparte entre las demás (se normaliza).
   - Modo automático: se marcan 4 o 5 competencias clave y reciben juntas el % elegido (35 % por defecto);
     el resto se reparte en partes iguales entre las demás.
   - Modo manual: cada competencia tiene los puntos que se escriban (deben sumar 100).
   Sin perfil, el CRR es el índice general: promedio simple de las competencias positivas. */
import { METRICS_FALLBACK, isRisk, mean, normText } from "./metrics";

/** Las 24 competencias del informe (nombres originales del juego) */
export const COMPETENCIAS = METRICS_FALLBACK;
/** Compatibilidad: antes solo se podían elegir claves entre las positivas */
export const COMPETENCIAS_CLAVE = METRICS_FALLBACK.filter((m) => !isRisk(m));
export const PCT_CLAVES_BASE = 35;

export interface Perfil {
  nombre: string;
  /** competencias marcadas como clave (nombres originales) */
  claves: string[];
  /** puntos por competencia (clave: normText del nombre); suman 100 */
  pesos: Record<string, number>;
  modo: "auto" | "manual";
  /** % del total que reciben las claves en modo automático */
  pctClaves: number;
  actualizadoPor?: string | null;
  actualizadoEn?: string | null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
/** Redondea a un decimal manteniendo la suma exacta (método del mayor resto, en décimas) */
function redondear(raw: Record<string, number>, total = 100): Record<string, number> {
  const e = Object.entries(raw).map(([k, v]) => ({ k, d: v * 10, b: Math.floor(v * 10) }));
  let falta = Math.round(total * 10) - e.reduce((a, x) => a + x.b, 0);
  e.sort((a, b) => (b.d - b.b) - (a.d - a.b));
  for (const x of e) { if (falta <= 0) break; x.b++; falta--; }
  return Object.fromEntries(e.map((x) => [x.k, x.b / 10]));
}

/** Reparto automático: las claves comparten `pct` puntos y el resto (100 − pct) se reparte entre las demás. Suma exactamente 100. */
export function repartir(claves: string[], pct = PCT_CLAVES_BASE): Record<string, number> {
  const k = new Set(claves.map(normText));
  const todas = COMPETENCIAS.map(normText);
  const nk = todas.filter((m) => k.has(m)).length, nr = todas.length - nk;
  const p = nk ? Math.min(100, Math.max(0, pct)) : 0;
  const raw: Record<string, number> = {};
  todas.forEach((m) => { raw[m] = k.has(m) ? p / nk : nr ? (100 - p) / nr : 0; });
  const out = redondear(raw);
  return Object.fromEntries(todas.map((m) => [m, out[m]]));
}
/** Reparto en partes iguales (todas valen lo mismo) */
export const repartirIgual = () => repartir([], 0);
export const totalPesos = (pesos: Record<string, number>) => r1(Object.values(pesos).reduce((a, b) => a + (Number(b) || 0), 0));
/** Escala los pesos para que sumen 100 */
export function aCien(pesos: Record<string, number>): Record<string, number> {
  const t = totalPesos(pesos);
  if (!t) return repartirIgual();
  const out = redondear(Object.fromEntries(Object.entries(pesos).map(([k, v]) => [k, ((Number(v) || 0) * 100) / t])));
  return Object.fromEntries(Object.keys(pesos).map((k) => [k, out[k]]));
}

/** Crea un perfil a partir de sus claves (modo automático) */
export const nuevoPerfil = (nombre: string, claves: string[], pctClaves = PCT_CLAVES_BASE): Perfil =>
  ({ nombre, claves, pesos: repartir(claves, pctClaves), modo: "auto", pctClaves });

/* Perfiles de partida (propuesta por área; se revisan en Ajustes → Carreras y perfiles).
   Las variantes con R o S al final (ISOR, ATHS…) usan el perfil de su carrera base. */
const P = (nombre: string, ...claves: string[]) => nuevoPerfil(nombre, claves);
export const PERFILES_BASE: Record<string, Perfil> = {
  ADM: P("Administración", "Evaluación estratégica", "Orientación a Resultados", "Resolución de problemas", "Iniciativa", "Evaluación"),
  FIN: P("Finanzas", "Analítica", "Razonamiento Deductivo", "Evaluación", "Pensamiento Crítico", "Excelencia Sostenida"),
  ECO: P("Economía", "Analítica", "Razonamiento Inductivo", "Razonamiento Deductivo", "Pensamiento Crítico", "Evaluación estratégica"),
  MER: P("Mercadeo", "Innovación", "Evaluación estratégica", "Iniciativa", "Orientación a Resultados", "Agilidad de Aprendizaje"),
  PUB: P("Publicidad", "Innovación", "Iniciativa", "Evaluación estratégica", "Agilidad de Aprendizaje", "Resolución de problemas"),
  NIN: P("Negocios Internacionales", "Evaluación estratégica", "Evaluación", "Agilidad de Aprendizaje", "Orientación a Resultados", "Resiliencia"),
  ATH: P("Administración Turística y Hotelera", "Orientación a Resultados", "Resolución de problemas", "Resiliencia", "Iniciativa", "Perseverancia"),
  GAS: P("Gastronomía", "Innovación", "Perseverancia", "Excelencia Sostenida", "Orientación a Resultados", "Resiliencia"),
  ISO: P("Ingeniería de Software", "Resolución de problemas", "Razonamiento Deductivo", "Analítica", "Agilidad de Aprendizaje", "Innovación"),
  ISC: P("Ingeniería de Sistemas de Computación", "Resolución de problemas", "Razonamiento Deductivo", "Analítica", "Agilidad de Aprendizaje", "Perseverancia"),
  DER: P("Derecho", "Pensamiento Crítico", "Razonamiento Deductivo", "Evaluación", "Analítica", "Tenacidad"),
  DIG: P("Diseño Gráfico", "Innovación", "Iniciativa", "Agilidad de Aprendizaje", "Excelencia Sostenida", "Perseverancia"),
  DIN: P("Diseño de Interiores", "Innovación", "Resolución de problemas", "Excelencia Sostenida", "Evaluación", "Iniciativa"),
  CDG: P("Comunicación Digital", "Innovación", "Agilidad de Aprendizaje", "Evaluación estratégica", "Iniciativa", "Orientación a Resultados"),
  CIN: P("Cine y Comunicación Audiovisual", "Innovación", "Iniciativa", "Perseverancia", "Tenacidad", "Agilidad de Aprendizaje"),
};

/** Normaliza un perfil leído de la base o de una versión anterior (que solo tenía claves y un peso global) */
export function leerPerfil(x: unknown, nombreDefecto = ""): Perfil | null {
  const p = x as Partial<Perfil> & { pct_claves?: number; actualizado_por?: string; actualizado_en?: string };
  if (!p || typeof p !== "object" || !Array.isArray(p.claves)) return null;
  const claves = p.claves.map(String);
  const pct = typeof p.pctClaves === "number" ? p.pctClaves : typeof p.pct_claves === "number" ? p.pct_claves : PCT_CLAVES_BASE;
  const tienePesos = p.pesos && typeof p.pesos === "object" && Object.keys(p.pesos).length > 0;
  const pesos = tienePesos ? Object.fromEntries(Object.entries(p.pesos!).map(([k, v]) => [normText(k), Number(v) || 0])) : repartir(claves, pct);
  return { nombre: String(p.nombre ?? nombreDefecto), claves, pesos, modo: p.modo === "manual" ? "manual" : "auto", pctClaves: pct,
    actualizadoPor: p.actualizadoPor ?? p.actualizado_por ?? null, actualizadoEn: p.actualizadoEn ?? p.actualizado_en ?? null };
}

let perfiles: Record<string, Perfil> = PERFILES_BASE;
/** Carga los perfiles: los de la base (tabla perfiles_carrera) o, si aún no hay, los del ajuste anterior o los de partida */
export function setPerfiles(deTabla?: { codigo: string }[] | null, deAjustes?: unknown) {
  if (deTabla && deTabla.length) {
    perfiles = Object.fromEntries(deTabla.map((x) => [normText(x.codigo), leerPerfil(x, x.codigo)]).filter(([, p]) => p) as [string, Perfil][]);
    return;
  }
  const a = deAjustes as { perfiles?: Record<string, unknown> } | undefined;
  if (a?.perfiles && typeof a.perfiles === "object") {
    perfiles = Object.fromEntries(Object.entries(a.perfiles).map(([k, p]) => [normText(k), leerPerfil(p, k)]).filter(([, p]) => p) as [string, Perfil][]);
    return;
  }
  perfiles = PERFILES_BASE;
}
export const perfilesActuales = () => perfiles;

/** Código del perfil que usa una carrera: exacto, sin la R/S final (ISOR → ISO) o por su nombre */
export function codigoPerfil(codigo: string, nombre = "", ps: Record<string, Perfil> = perfiles): string | null {
  const c = normText(codigo);
  if (!c) return null;
  if (ps[c]) return c;
  const base = c.replace(/[RS]$/, "");
  if (base !== c && ps[base]) return base;
  const nombres = [normText(nombre), c].filter(Boolean);
  return Object.entries(ps).find(([, p]) => nombres.includes(normText(p.nombre)))?.[0] ?? null;
}
export function perfilDe(codigo: string, nombre?: string): { codigo: string; perfil: Perfil } | null {
  const k = codigoPerfil(codigo, nombre);
  return k ? { codigo: k, perfil: perfiles[k] } : null;
}

/** CRR ponderado: promedio de las competencias con los pesos dados (riesgo invertido; se normaliza por los pesos presentes) */
export function crrPonderado(metrics: string[], valores: number[], pesos: Record<string, number>, excluir?: Set<string>): number | null {
  let s = 0, w = 0;
  metrics.forEach((m, i) => {
    if (excluir?.has(m)) return;
    const v = valores[i], p = pesos[normText(m)] ?? 0;
    if (typeof v !== "number" || isNaN(v) || p <= 0) return;
    s += p * (isRisk(m) ? 100 - v : v); w += p;
  });
  return w ? s / w : null;
}
/** Índice general (sin ponderar): promedio simple de las competencias positivas */
export function indiceGeneral(metrics: string[], valores: number[], excluir?: Set<string>): number | null {
  return mean(metrics.map((m, i) => (isRisk(m) || excluir?.has(m) ? null : valores[i])));
}
/** CRR de un estudiante: ponderado con el perfil de su carrera, o el índice general si su carrera no tiene perfil */
export function crrDe(metrics: string[], valores: number[], carrera: string, nombreCarrera?: string, excluir?: Set<string>) {
  const pf = perfilDe(carrera, nombreCarrera);
  const general = indiceGeneral(metrics, valores, excluir);
  const crr = pf ? crrPonderado(metrics, valores, pf.perfil.pesos, excluir) ?? general : general;
  return { crr, general, codigo: pf?.codigo ?? null };
}
