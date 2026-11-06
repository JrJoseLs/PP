export type Rol = "admin" | "decano" | "maestro";

export interface Profile {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  decano_id: string | null;
  activo: boolean;
}

export interface Clase {
  id: string;
  nombre: string;
  grupo: string;
  periodo: string;
  color: string;
  metrics: string[];
  archivo?: string | null;
  created_at: string;
  decanos: string[];   // ids de decanos con acceso (los asigna el admin)
  maestros: string[];  // ids de maestros con acceso (los asigna el decano o el admin)
}

export interface Resultado {
  id: string;
  clase_id: string;
  nombre: string;
  matricula: string;
  carrera: string;
  grupo: string;
  /** Equipo dentro del juego (columna "Empresa" / "Team") */
  equipo?: string;
  valores: number[];
}

export interface Carrera { codigo: string; nombre: string; }
/** Persona del directorio de estudiantes (solo lo ve administración) */
export interface RosterEntry {
  matricula: string;
  nombre: string;
  carrera: string;
  grupo: string;
  equipo?: string;
  email?: string;
  licencia?: string;
}

/** Cambio puntual sobre un resultado ya cargado (completar datos desde el directorio) */
export interface ResultadoPatch { id: string; matricula?: string; carrera?: string; grupo?: string; equipo?: string; }

/** Ajustes de la plataforma: nombres visibles de roles y competencias */
export type Ajustes = { roles?: unknown; competencias?: Record<string, string> } & Record<string, unknown>;

/** Desempeño en el juego de un jugador (informe «igrades»). El enlace con su estudiante se calcula al cargar. */
export interface Desempeno {
  id: string;
  clase_id: string;
  nombre: string;
  email: string;
  equipo: string;
  trimestres: number | null;
  bsc_acum: number | null;         // Balanced Scorecard acumulado de su equipo
  bsc: number | null;              // Balanced Scorecard del último trimestre de su equipo
  minutos: number | null;          // tiempo propio
  puntaje: number | null;          // puntuación calculada automáticamente
  puntaje_ajustado: number | null; // ajustada por el instructor
}
export interface DesempenoEquipo {
  clase_id: string;
  equipo: string;
  trimestres: number | null;
  bsc_acum: number | null;
  bsc: number | null;
  minutos: number | null;          // tiempo total del equipo
  percentil: number | null;
  puntaje: number | null;
}

/** Lo que el usuario actual puede ver (ya filtrado por permisos) */
export interface Snapshot {
  profiles: Profile[];
  clases: Clase[];
  resultados: Resultado[];
  carreras: Carrera[];
  ajustes: Ajustes;
  desempeno: Desempeno[];
  desempenoEquipos: DesempenoEquipo[];
}

export interface NewUser {
  usuario: string;
  nombre: string;
  password: string;
  rol: Rol;
  decano_id: string | null;
}

export interface ClaseDraft {
  nombre: string;
  grupo: string;
  periodo: string;
  color: string;
  metrics: string[];
  archivo: string;
  estudiantes: Omit<Resultado, "id" | "clase_id">[];
  decanos: string[];
}

