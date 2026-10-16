/* Datos de ejemplo: 4 decanos, 16 maestros, 16 clases, ~400 estudiantes.
   Generados con semilla fija para que todos vean lo mismo. Nada es real. */
import type { Ajustes, Carrera, Clase, Profile, Resultado, RosterEntry } from "../lib/types";
import { METRICS_FALLBACK, displayName, isRisk, normText } from "../lib/metrics";

export interface DemoDb {
  version: number;
  profiles: (Profile & { password: string })[];
  clases: Clase[];
  resultados: Resultado[];
  carreras: Carrera[];
  roster: RosterEntry[];
  ajustes?: Ajustes;
}

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const PALETTE = ["#0a84ff", "#ff9f0a", "#30d158", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#5e5ce6", "#ac8e68", "#ff6482", "#32ade6", "#66d4cf"];

const FACULTADES = [
  { decano: ["ana.morales", "Dra. Ana Morales"], area: "Ingeniería", carreras: [["ISO", "Ing. de Software"], ["IND", "Ing. Industrial"], ["CIV", "Ing. Civil"]],
    clases: ["Gestión de Proyectos", "Algoritmos Avanzados", "Investigación de Operaciones", "Diseño Estructural"],
    maestros: [["luis.garcia", "Luis García"], ["sofia.rojas", "Sofía Rojas"], ["miguel.santos", "Miguel Santos"], ["elena.vargas", "Elena Vargas"]] },
  { decano: ["carlos.pena", "Dr. Carlos Peña"], area: "Negocios", carreras: [["ADM", "Administración"], ["MER", "Mercadeo"], ["CON", "Contabilidad"]],
    clases: ["Simulación Gerencial", "Finanzas Corporativas", "Estrategia de Mercados", "Auditoría"],
    maestros: [["valeria.cruz", "Valeria Cruz"], ["andres.medina", "Andrés Medina"], ["paula.reyes", "Paula Reyes"], ["diego.herrera", "Diego Herrera"]] },
  { decano: ["lucia.fernandez", "Dra. Lucía Fernández"], area: "Salud", carreras: [["MED", "Medicina"], ["ENF", "Enfermería"], ["PSI", "Psicología"]],
    clases: ["Bioética", "Toma de Decisiones Clínicas", "Salud Pública", "Psicología Organizacional"],
    maestros: [["carmen.ortiz", "Carmen Ortiz"], ["raul.jimenez", "Raúl Jiménez"], ["isabel.navarro", "Isabel Navarro"], ["tomas.castillo", "Tomás Castillo"]] },
  { decano: ["jorge.ramirez", "Mtro. Jorge Ramírez"], area: "Humanidades", carreras: [["DER", "Derecho"], ["COM", "Comunicación"], ["EDU", "Educación"]],
    clases: ["Ética Profesional", "Liderazgo y Negociación", "Pensamiento Crítico", "Comunicación Estratégica"],
    maestros: [["natalia.flores", "Natalia Flores"], ["hector.mendoza", "Héctor Mendoza"], ["laura.silva", "Laura Silva"], ["ricardo.vega", "Ricardo Vega"]] },
];
const TEAMS = ["STRYDE BIKES", "BIKING", "CarbonRide", "Velo Andino", "Ruta Norte", "Pedal Pro", "Cumbre Cycles", "Rueda Libre"];
const NOMBRES = ["JUAN", "MARÍA", "JOSÉ", "ANA", "LUIS", "CARMEN", "CARLOS", "LAURA", "PEDRO", "SOFÍA", "MIGUEL", "VALENTINA", "DANIEL", "CAMILA", "JORGE", "ISABELLA", "RAFAEL", "GABRIELA", "FERNANDO", "ANDREA", "ALEJANDRO", "PAULA", "MANUEL", "LUCÍA", "RICARDO", "DANIELA", "EDUARDO", "NATALIA", "ANTONIO", "MARIANA", "FRANCISCO", "ELENA", "ROBERTO", "VICTORIA", "ÁNGEL", "JULIA", "SAMUEL", "RENATA", "EMILIO", "XIMENA"];
const APELLIDOS = ["GARCÍA", "RODRÍGUEZ", "MARTÍNEZ", "HERNÁNDEZ", "LÓPEZ", "GONZÁLEZ", "PÉREZ", "SÁNCHEZ", "RAMÍREZ", "TORRES", "FLORES", "RIVERA", "GÓMEZ", "DÍAZ", "REYES", "MORALES", "CRUZ", "ORTIZ", "GUTIÉRREZ", "CHÁVEZ", "RAMOS", "VARGAS", "CASTILLO", "JIMÉNEZ", "MORENO", "ROMERO", "ALVARADO", "MENDOZA", "RUIZ", "AGUILAR", "MEDINA", "CASTRO", "VEGA", "SOTO", "PEÑA", "NÚÑEZ", "PAULINO", "ALMONTE", "DE LA CRUZ", "BATISTA"];

export function buildDemo(): DemoDb {
  const r = rng(20261009);
  const gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  const id = (p: string, i: number) => `${p}-${String(i).padStart(4, "0")}-demo`;

  const profiles: DemoDb["profiles"] = [{ id: "u-admin", usuario: "admin", nombre: "Administración", rol: "admin", decano_id: null, activo: true, password: "demo" }];
  const clases: Clase[] = [], resultados: Resultado[] = [], carreras: Carrera[] = [];
  const roster: DemoDb["roster"] = [];
  let ci = 0, ri = 0;
  const metrics = METRICS_FALLBACK;

  FACULTADES.forEach((f, fi) => {
    const decId = "u-" + f.decano[0];
    profiles.push({ id: decId, usuario: f.decano[0], nombre: f.decano[1], rol: "decano", decano_id: null, activo: true, password: "demo" });
    f.carreras.forEach(([codigo, nombre]) => carreras.push({ codigo, nombre }));
    const facBase = [0.25, 0.05, 0.35, -0.15][fi];
    f.maestros.forEach(([u, n], mi) => {
      const mId = "u-" + u;
      profiles.push({ id: mId, usuario: u, nombre: n, rol: "maestro", decano_id: decId, activo: true, password: "demo" });
      const cId = id("c", ++ci);
      const grupo = String(1500 + ci * 7);
      clases.push({
        id: cId, nombre: f.clases[mi], grupo, periodo: ci % 3 ? "2026-2" : "2026-1", color: PALETTE[(ci - 1) % PALETTE.length],
        metrics, archivo: `icompetencyreport-${15540 + ci}.xlsx`, created_at: new Date(Date.UTC(2026, 7, ci)).toISOString(),
        decanos: [decId],
        // la última clase de cada decano queda sin maestro: así se ve el flujo de asignación
        maestros: mi < 3 ? [mId] : [],
      });
      const base = facBase + gauss() * 0.35;
      const profile = metrics.map(() => gauss() * 7);
      const count = 20 + Math.floor(r() * 12);
      const used = new Set<string>();
      // equipos del juego de esta clase (columna "Empresa" del informe)
      const teams = [...TEAMS].sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 2));
      for (let s = 0; s < count; s++) {
        let nombre = "";
        do { nombre = `${pick(APELLIDOS)} ${pick(APELLIDOS)}, ${pick(NOMBRES)}${r() < 0.5 ? " " + pick(NOMBRES) : ""}`; } while (used.has(nombre));
        used.add(nombre);
        const a = gauss() * 0.9 + base;
        const effort = gauss() * 0.6;
        const valores = metrics.map((m, k) => {
          if (/F[ÉE]NIX/i.test(m)) return r() < 0.8 ? 0 : clamp(45 + a * 15 + gauss() * 15);
          if (isRisk(m)) return clamp(34 - a * 13 - effort * 6 + profile[k] * 0.6 + gauss() * 10);
          if (/ESFUERZO|TENACIDAD|PERSEVERANCIA/i.test(m)) return clamp(56 + a * 9 + effort * 14 + profile[k] + gauss() * 9);
          return clamp(55 + a * 15 + profile[k] + gauss() * 9);
        });
        const carrera = pick(f.carreras)[0], matricula = "A00" + (118000 + ri * 7), equipo = teams[s % teams.length];
        // ~12 % llega del juego sin carrera ni matrícula: el directorio las completa ("Aplicar a las clases")
        const conocido = r() > 0.12;
        resultados.push({ id: id("r", ++ri), clase_id: cId, nombre, valores, grupo, equipo,
          carrera: conocido ? carrera : "", matricula: conocido ? matricula : "" });
        // directorio de ejemplo: con algunos huecos para mostrar cómo se completan
        roster.push({ nombre: displayName(nombre), matricula, carrera: r() < 0.08 ? "" : carrera, grupo, equipo,
          email: r() < 0.7 ? normText(displayName(nombre)).toLowerCase().split(" ").slice(0, 2).join(".") + "@universidad.edu" : "", licencia: "" });
      }
    });
  });
  return { version: 2, profiles, clases, resultados, carreras, roster, ajustes: {} };
}

export const DEMO_ACCOUNTS = [
  { usuario: "admin", nombre: "Administración", rol: "admin" as const, nota: "Carga clases y decide quién las ve" },
  { usuario: "ana.morales", nombre: "Dra. Ana Morales", rol: "decano" as const, nota: "Ingeniería · 4 clases y su equipo" },
  { usuario: "luis.garcia", nombre: "Luis García", rol: "maestro" as const, nota: "Gestión de Proyectos" },
];
