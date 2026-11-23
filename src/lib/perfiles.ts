/* Índice de perfil de carrera: el CRR general promedia todas las competencias por igual; este índice
   da más peso (por defecto 60 %) a las 5 competencias clave de la carrera del estudiante y el resto
   (40 %) al promedio de las demás. Sirve para comparar DENTRO de una carrera: cada carrera usa su fórmula.
   Las claves y el peso los define administración en Ajustes → «Perfiles por carrera». */
import { isRisk, mean, normText } from "./metrics";

export interface Perfil { nombre: string; claves: string[]; }
export interface PerfilesCfg { peso: number; perfiles: Record<string, Perfil>; }

/** Competencias que pueden ser clave: las positivas (las de riesgo no cuentan en el índice) */
export const COMPETENCIAS_CLAVE = [
  "Pensamiento Crítico", "Resolución de problemas", "Esfuerzo - Actividades", "Esfuerzo - Tiempo Invertido",
  "Razonamiento Inductivo", "Razonamiento Deductivo", "Agilidad de Aprendizaje", "Evaluación estratégica",
  "Analítica", "Evaluación", "Innovación", "Tenacidad", "Perseverancia", "Iniciativa", "Orientación a Resultados",
  "Excelencia Sostenida", "Resiliencia", "Fénix",
];

/* Perfiles de partida. Son una propuesta razonable por área: revísalos y ajústalos en Ajustes.
   Las variantes con R o S al final (ISOR, ATHS…) usan el perfil de su carrera base. */
const P = (nombre: string, ...claves: string[]): Perfil => ({ nombre, claves });
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
export const PESO_BASE = 0.6;

let cfg: PerfilesCfg = { peso: PESO_BASE, perfiles: PERFILES_BASE };
/** Carga la configuración guardada en Ajustes (o la de partida) */
export function setPerfiles(a?: unknown) {
  const x = a as Partial<PerfilesCfg> | undefined;
  const ok = x && typeof x === "object" && x.perfiles && typeof x.perfiles === "object";
  const peso = typeof x?.peso === "number" && x.peso >= 0.3 && x.peso <= 1 ? x.peso : PESO_BASE;
  cfg = { peso, perfiles: ok ? Object.fromEntries(Object.entries(x!.perfiles!).filter(([, p]) => p && Array.isArray(p.claves)).map(([k, p]) => [k.toUpperCase(), { nombre: String(p.nombre ?? k), claves: p.claves.slice(0, 5).map(String) }])) : PERFILES_BASE };
}
export const perfilesCfg = () => cfg;

/** Perfil de una carrera: por su código exacto, por su código sin la R/S final (ISOR → ISO) o por su nombre */
export function perfilDe(codigo: string, nombre?: string): { codigo: string; perfil: Perfil } | null {
  const ps = cfg.perfiles;
  const c = normText(codigo);
  if (!c) return null;
  if (ps[c]) return { codigo: c, perfil: ps[c] };
  const base = c.replace(/[RS]$/, "");
  if (base !== c && ps[base]) return { codigo: base, perfil: ps[base] };
  const nombres = [normText(nombre ?? ""), c];
  const porNombre = Object.entries(ps).find(([, p]) => nombres.includes(normText(p.nombre)));
  return porNombre ? { codigo: porNombre[0], perfil: porNombre[1] } : null;
}

/** Índice de perfil: peso × promedio de las 5 claves + (1 − peso) × promedio del resto de positivas.
    Usa solo las competencias que cuentan en el CRR (sin riesgo ni casi vacías). */
export function perfilIndex(metrics: string[], valores: number[], claves: string[], excluir?: Set<string>, peso = cfg.peso): number | null {
  const k = new Set(claves.map(normText));
  const clave: number[] = [], resto: number[] = [];
  metrics.forEach((m, i) => {
    if (isRisk(m) || excluir?.has(m)) return;
    const v = valores[i];
    if (typeof v !== "number" || isNaN(v)) return;
    (k.has(normText(m)) ? clave : resto).push(v);
  });
  const a = mean(clave), b = mean(resto);
  if (a === null) return null;
  return b === null ? a : peso * a + (1 - peso) * b;
}
