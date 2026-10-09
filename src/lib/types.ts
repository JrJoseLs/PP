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

/** Lo que el usuario actual puede ver (ya filtrado por permisos) */
export interface Snapshot {
  profiles: Profile[];
  clases: Clase[];
  resultados: Resultado[];
  carreras: Carrera[];
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

export const ROL_LABEL: Record<Rol, string> = { admin: "Administración", decano: "Decano/a", maestro: "Maestro/a" };
