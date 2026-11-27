/* Selector «Resaltar perfil»: elige el perfil de una carrera para destacar en el radar sus competencias clave
   (franja de color, ★ y sus puntos). Propone el perfil que predomina entre los estudiantes que se están viendo. */
import { perfilesActuales, type Perfil } from "../lib/perfiles";
import type { Row } from "../lib/metrics";

/** Perfil que usa al menos el `minimo` de las filas (p. ej. 40 %), o null */
export function perfilPredominante(rows: Row[], minimo = 0.4): string | null {
  const n = new Map<string, number>();
  rows.forEach((r) => { if (r.perfilCodigo) n.set(r.perfilCodigo, (n.get(r.perfilCodigo) ?? 0) + 1); });
  const [k, c] = [...n].sort((a, b) => b[1] - a[1])[0] ?? [];
  return k && c / Math.max(1, rows.length) >= minimo ? k : null;
}
/** Perfil elegido (o null) para pasarlo al radar */
export const perfilElegido = (k: string | null): Perfil | null => (k ? perfilesActuales()[k] ?? null : null);

export function ResaltarPerfil({ value, onChange, rows }: { value: string | null; onChange(v: string | null): void; rows: Row[] }) {
  const ps = perfilesActuales();
  // primero los perfiles de los estudiantes que se ven, luego el resto
  const usados = [...new Set(rows.map((r) => r.perfilCodigo).filter((x): x is string => !!x))];
  const otros = Object.keys(ps).filter((k) => !usados.includes(k)).sort();
  if (!Object.keys(ps).length) return null;
  return (
    <label className="resaltar" title="Destaca en el radar las competencias clave de una carrera">
      <span>★ Resaltar</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Ningún perfil</option>
        {usados.length > 0 && <optgroup label="En esta vista">{usados.sort().map((k) => <option key={k} value={k}>{k} · {ps[k]?.nombre}</option>)}</optgroup>}
        <optgroup label="Otros perfiles">{otros.map((k) => <option key={k} value={k}>{k} · {ps[k].nombre}</option>)}</optgroup>
      </select>
    </label>
  );
}
