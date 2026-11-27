/* Reporte ejecutivo: cálculos y redacción automática a partir de los datos.
   Resume un conjunto de clases (p. ej. los 16 grupos de ADM535 de un cuatrimestre) para enviarlo
   a la universidad: indicadores, comparativa de grupos, competencias, carreras, simulación,
   estudiantes que necesitan apoyo, conclusiones y recomendaciones. Todo sale de los datos,
   así que se adapta a cualquier asignatura o período. */
import { fmt, isRisk, levelOf, mean, plural, sparseMetrics, type Row } from "./metrics";
import { metricName } from "./labels";
import { pearson } from "./game";
import type { Clase, Desempeno, DesempenoEquipo } from "./types";

export interface JuegoResumen { completos: Desempeno[]; jugadores: Desempeno[]; equiposOk: DesempenoEquipo[]; meta: number; }
export interface GrupoReporte {
  clase: Clase; n: number; crr: number | null; general: number | null;
  alto: number; medio: number; bajo: number;
  completos: number; jugadores: number; scorecard: number | null; tiempo: number | null; meta: number;
  fuerte: string | null; debil: string | null;
}
export interface Reporte {
  grupos: GrupoReporte[]; estudiantes: number; crr: number | null; general: number | null; dispersion: number | null;
  niveles: { alto: number; medio: number; bajo: number };
  sim: { conJuego: number; completos: number; jugadores: number; scorecard: number | null; tiempo: number | null; relacion: number | null; trimestre: number };
  competencias: { m: string; v: number; riesgo: boolean }[];
  fuertes: { m: string; v: number }[]; debiles: { m: string; v: number }[]; riesgos: { m: string; v: number }[];
  diferencias: { m: string; min: { g: string; v: number }; max: { g: string; v: number }; rango: number }[];
  carreras: { carrera: string; n: number; crr: number | null; fuerte: string | null }[];
  apoyo: Row[];
}

/** Último elemento (sin Array.at, que este proyecto no usa) */
export const ult = <T,>(a: T[]): T | undefined => a[a.length - 1];
const prom = (xs: (number | null | undefined)[]) => mean(xs);
const desv = (xs: number[]) => { const m = mean(xs); return m === null || xs.length < 2 ? null : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); };

/** Fuerte y débil de un conjunto de filas (solo competencias positivas, sin las casi vacías) */
function extremos(rows: Row[], metrics: string[]) {
  const v = metrics.filter((m) => !isRisk(m)).map((m) => ({ m, v: prom(rows.map((r) => valor(r, m))) }))
    .filter((x): x is { m: string; v: number } => x.v !== null && x.v > 0.5);
  v.sort((a, b) => b.v - a.v);
  return { fuerte: v[0]?.m ?? null, debil: ult(v)?.m ?? null, lista: v };
}
const valor = (r: Row, m: string) => { const i = r.cls.metrics.indexOf(m); return i >= 0 ? r.r.valores[i] ?? null : null; };

export function construirReporte(clases: Clase[], rowsByClase: Map<string, Row[]>, juegos: Map<string, JuegoResumen>, metricsTodas: string[]): Reporte {
  const rows = clases.flatMap((c) => rowsByClase.get(c.id) ?? []);
  // las competencias casi vacías (≥ 70 % en 0, como «Superación») no cuentan: igual que en el radar y en el CRR
  const vacias = sparseMetrics(rows, metricsTodas);
  const metrics = metricsTodas.filter((m) => !vacias.has(m));
  const grupos: GrupoReporte[] = clases.map((c) => {
    const rr = rowsByClase.get(c.id) ?? [];
    const j = juegos.get(c.id);
    const niv = { alto: 0, medio: 0, bajo: 0 };
    rr.forEach((r) => { const l = levelOf(r.indice); if (l) niv[l.id]++; });
    const e = extremos(rr, c.metrics.filter((m) => !vacias.has(m)));
    return { clase: c, n: rr.length, crr: prom(rr.map((r) => r.indice)), general: prom(rr.map((r) => r.general)), ...niv,
      completos: j?.completos.length ?? 0, jugadores: j?.jugadores.length ?? 0, meta: j?.meta ?? 0,
      scorecard: prom((j?.equiposOk ?? []).map((x) => x.bsc_acum)), tiempo: prom((j?.completos ?? []).map((x) => x.minutos)),
      fuerte: e.fuerte, debil: e.debil };
  }).sort((a, b) => (b.crr ?? -1) - (a.crr ?? -1));

  const niveles = { alto: 0, medio: 0, bajo: 0 };
  rows.forEach((r) => { const l = levelOf(r.indice); if (l) niveles[l.id]++; });
  const competencias = metrics.map((m) => ({ m, v: prom(rows.map((r) => valor(r, m))), riesgo: isRisk(m) }))
    .filter((x): x is { m: string; v: number; riesgo: boolean } => x.v !== null && x.v > 0.5);
  const positivas = competencias.filter((x) => !x.riesgo).sort((a, b) => b.v - a.v);
  const conJuego = grupos.filter((g) => g.jugadores > 0);
  const completos = rows.filter((r) => r.juego);
  const pares = completos.filter((r) => r.juego!.minutos != null && r.juego!.bsc_acum != null).map((r) => [r.juego!.minutos!, r.juego!.bsc_acum!] as [number, number]);

  // dónde se diferencian los grupos: competencias con más distancia entre el promedio del mejor y del peor grupo
  const diferencias = grupos.length > 1 ? metrics.map((m) => {
    const vs = grupos.map((g) => ({ g: g.clase.nombre, v: prom((rowsByClase.get(g.clase.id) ?? []).map((r) => valor(r, m))) }))
      .filter((x): x is { g: string; v: number } => x.v !== null);
    if (vs.length < 2) return null;
    vs.sort((a, b) => a.v - b.v);
    return { m, min: vs[0], max: ult(vs)!, rango: ult(vs)!.v - vs[0].v };
  }).filter((x): x is NonNullable<typeof x> => !!x && x.rango >= 1).sort((a, b) => b.rango - a.rango).slice(0, 5) : [];

  const porCarrera = new Map<string, Row[]>();
  rows.forEach((r) => porCarrera.set(r.carrera, [...(porCarrera.get(r.carrera) ?? []), r]));
  const carreras = [...porCarrera].map(([carrera, rr]) => ({ carrera, n: rr.length, crr: prom(rr.map((r) => r.indice)), fuerte: extremos(rr, metrics).fuerte }))
    .sort((a, b) => b.n - a.n);

  return {
    grupos, estudiantes: rows.length, crr: prom(rows.map((r) => r.indice)), general: prom(rows.map((r) => r.general)),
    dispersion: desv(grupos.map((g) => g.crr).filter((x): x is number => x !== null)), niveles,
    sim: { conJuego: conJuego.length, completos: conJuego.reduce((a, g) => a + g.completos, 0), jugadores: conJuego.reduce((a, g) => a + g.jugadores, 0),
      scorecard: prom(conJuego.map((g) => g.scorecard)), tiempo: prom(completos.map((r) => r.juego!.minutos)), relacion: pearson(pares),
      trimestre: Math.max(0, ...conJuego.map((g) => g.meta)) },
    competencias, fuertes: positivas.slice(0, 3), debiles: positivas.slice(-3).reverse(),
    riesgos: competencias.filter((x) => x.riesgo).sort((a, b) => b.v - a.v).slice(0, 2),
    diferencias, carreras, apoyo: rows.filter((r) => r.indice !== null && r.indice < 34).sort((a, b) => a.indice! - b.indice!),
  };
}

/* ---------- Redacción ---------- */
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${ult(xs)}`);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const nivelTxt = (v: number | null) => (v === null ? "sin datos" : v >= 66 ? "alto" : v >= 34 ? "medio" : "bajo");
const fuerza = (r: number) => (Math.abs(r) < 0.2 ? "prácticamente nula" : Math.abs(r) < 0.5 ? "moderada" : "fuerte");

export interface Textos { resumen: string; hallazgos: string[]; conclusiones: string[]; recomendaciones: string[]; }

export function redactar(r: Reporte, alcance: string): Textos {
  const g = r.grupos.filter((x) => x.crr !== null);
  const mejor = g[0], peor = ult(g);
  const total = r.niveles.alto + r.niveles.medio + r.niveles.bajo;
  const resumen = [
    `Este reporte resume ${alcance}: ${plural(r.grupos.length, "grupo", "grupos")} y ${plural(r.estudiantes, "estudiante", "estudiantes")}.`,
    r.crr !== null ? `El índice de preparación profesional (CRR) promedio es ${fmt(r.crr)}, un nivel ${nivelTxt(r.crr)}; ${pct(r.niveles.alto, total)} % de los estudiantes está en nivel alto y ${pct(r.niveles.bajo, total)} % necesita apoyo.` : "",
    r.sim.conJuego ? `En la simulación, ${pct(r.sim.completos, r.sim.jugadores)} % de los participantes la completó${r.sim.trimestre ? ` hasta el trimestre ${r.sim.trimestre}` : ""}, con un Scorecard acumulado promedio de ${fmt(r.sim.scorecard)}.` : "",
    r.fuertes.length && r.debiles.length ? `La competencia más sólida es ${metricName(r.fuertes[0].m).toLowerCase()} (${fmt(r.fuertes[0].v)}) y la que más requiere atención es ${metricName(r.debiles[0].m).toLowerCase()} (${fmt(r.debiles[0].v)}).` : "",
  ].filter(Boolean).join(" ");

  const hallazgos: string[] = [];
  if (mejor && peor && mejor !== peor) hallazgos.push(`${mejor.clase.nombre} obtuvo el CRR más alto (${fmt(mejor.crr)}) y ${peor.clase.nombre} el más bajo (${fmt(peor.crr)}): ${fmt(mejor.crr! - peor.crr!)} puntos de diferencia.`);
  if (r.dispersion !== null && g.length > 2) hallazgos.push(r.dispersion < 4 ? `Los grupos tienen resultados muy parejos (desviación de ${fmt(r.dispersion)} puntos entre grupos).` : `Hay diferencias marcadas entre grupos (desviación de ${fmt(r.dispersion)} puntos): conviene revisar qué hacen distinto los mejores.`);
  if (r.diferencias[0]) { const d = r.diferencias[0]; hallazgos.push(`Donde más se separan los grupos es en ${metricName(d.m).toLowerCase()}: de ${fmt(d.min.v)} en ${d.min.g} a ${fmt(d.max.v)} en ${d.max.g}.`); }
  if (r.fuertes.length >= 2) hallazgos.push(`Fortalezas del conjunto: ${lista(r.fuertes.map((x) => `${metricName(x.m).toLowerCase()} (${fmt(x.v)})`))}.`);
  if (r.debiles.length >= 2) hallazgos.push(`A reforzar: ${lista(r.debiles.map((x) => `${metricName(x.m).toLowerCase()} (${fmt(x.v)})`))}.`);
  if (r.riesgos[0] && r.riesgos[0].v >= 35) hallazgos.push(`Entre los indicadores de riesgo destaca ${metricName(r.riesgos[0].m).toLowerCase()} con ${fmt(r.riesgos[0].v)} (aquí menos es mejor).`);
  if (r.sim.relacion !== null) hallazgos.push(`La relación entre el tiempo dedicado al juego y el Scorecard es ${fuerza(r.sim.relacion)}${Math.abs(r.sim.relacion) >= 0.2 ? (r.sim.relacion > 0 ? " y positiva: quienes dedicaron más tiempo tendieron a obtener mejores resultados" : " y negativa: dedicar más tiempo no se tradujo en mejores resultados") : ""} (r = ${r.sim.relacion.toFixed(2)}).`);
  const bajaPart = r.grupos.filter((x) => x.jugadores > 0 && x.completos / x.jugadores < 0.8);
  if (bajaPart.length) hallazgos.push(`${plural(bajaPart.length, "grupo tuvo", "grupos tuvieron")} menos del 80 % de la simulación completada: ${lista(bajaPart.map((x) => `${x.clase.nombre} (${pct(x.completos, x.jugadores)} %)`))}.`);

  const conclusiones: string[] = [];
  if (r.crr !== null) conclusiones.push(`El conjunto muestra una preparación profesional de nivel ${nivelTxt(r.crr)} (CRR ${fmt(r.crr)}), ${r.niveles.bajo ? `con ${plural(r.niveles.bajo, "estudiante", "estudiantes")} por debajo de 34 que requieren acompañamiento` : "sin estudiantes en nivel bajo"}.`);
  if (r.fuertes[0] && r.debiles[0]) conclusiones.push(`El perfil del grupo se apoya en ${metricName(r.fuertes[0].m).toLowerCase()} y tiene su principal oportunidad de mejora en ${metricName(r.debiles[0].m).toLowerCase()}.`);
  if (r.sim.conJuego) conclusiones.push(`La simulación tuvo una participación del ${pct(r.sim.completos, r.sim.jugadores)} %; el Scorecard acumulado promedio fue ${fmt(r.sim.scorecard)} y el tiempo promedio por estudiante, ${Math.round((r.sim.tiempo ?? 0) / 60)} h.`);

  const recomendaciones: string[] = [];
  if (r.debiles.length) recomendaciones.push(`Diseñar actividades específicas para fortalecer ${lista(r.debiles.slice(0, 2).map((x) => metricName(x.m).toLowerCase()))}, que son las competencias más bajas del conjunto.`);
  if (mejor && peor && mejor !== peor && mejor.crr! - peor.crr! >= 8) recomendaciones.push(`Compartir entre docentes las prácticas de ${mejor.clase.nombre}, el grupo con mejor CRR, especialmente con ${peor.clase.nombre}.`);
  if (bajaPart.length) recomendaciones.push(`Dar seguimiento a la participación en la simulación en ${lista(bajaPart.slice(0, 3).map((x) => x.clase.nombre))}, para que todos completen los trimestres.`);
  if (r.apoyo.length) recomendaciones.push(`Ofrecer acompañamiento individual a ${plural(r.apoyo.length, "estudiante", "estudiantes")} con CRR por debajo de 34.`);
  if (r.riesgos[0] && r.riesgos[0].v >= 35) recomendaciones.push(`Trabajar hábitos que reduzcan ${metricName(r.riesgos[0].m).toLowerCase()}: entregas parciales, metas por semana y retroalimentación temprana.`);
  if (!recomendaciones.length) recomendaciones.push("Mantener la estrategia actual y repetir la medición al cierre del próximo período para confirmar la tendencia.");
  return { resumen, hallazgos, conclusiones, recomendaciones };
}

/** Código de asignatura en el nombre de una clase: «CFel-ADM535-2176» → «ADM535» */
export const asignaturaDe = (nombre: string) => nombre.toUpperCase().match(/\b([A-Z]{3}\d{3})\b/)?.[1] ?? null;
