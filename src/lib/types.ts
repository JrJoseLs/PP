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
  valores: number[];
}

export interface Carrera { codigo: string; nombre: string; }
export interface RosterEntry { matricula: string; nombre: string; carrera: string; grupo: string; }

/** Ajustes de la plataforma: nombres visibles de roles y competencias */
export type Ajustes = { roles?: unknown; competencias?: Record<string, string> } & Record<string, unknown>;

/** Lo que el usuario actual puede ver (ya filtrado por permisos) */
export interface Snapshot {
  profiles: Profile[];
  clases: Clase[];
  resultados: Resultado[];
  carreras: Carrera[];
  ajustes: Ajustes;
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

