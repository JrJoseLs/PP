/* Permisos de pantallas que no dependen solo del rol */

/** Reporte ejecutivo: administración siempre; coordinadores si administración lo permite (por defecto sí); docentes nunca */
export function puedeVerReporte(rol: string, ajustes: Record<string, unknown>) {
  return rol === "admin" || (rol === "decano" && ajustes.reporteCoordinadores !== false);
}
