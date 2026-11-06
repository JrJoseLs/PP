/* Tarjeta de importación de un informe «igrades» (desempeño en el juego):
   sugiere la clase por equipos y estudiantes en común, muestra cuántos jugadores se enlazan
   y guarda (o deja listo para guardar junto con un informe nuevo del mismo lote). */
import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Icon } from "./ui";
import { fmtMin, linkJugadores, scoreClase, type Igrades } from "../lib/game";
import { displayName, fmt, plural } from "../lib/metrics";
import type { Resultado } from "../lib/types";

export interface GameJob { key: string; fileName: string; data: Igrades; target: string; saved?: boolean; }
type Est = Pick<Resultado, "nombre" | "matricula" | "equipo" | "grupo">;

/** Mejor clase (o borrador del mismo lote) para un informe igrades */
export function suggestTarget(data: Igrades, clases: { id: string; rows: Est[] }[], drafts: { key: string; raw: Est[] }[]) {
  const all = [...clases.map((c) => ({ id: "clase:" + c.id, rows: c.rows })), ...drafts.map((d) => ({ id: "draft:" + d.key, rows: d.raw }))]
    .map((c) => ({ id: c.id, ...scoreClase(data, c.rows) })).sort((a, b) => b.score - a.score);
  return all[0]?.score ? all[0].id : "";
}

export function GameCard({ job, drafts, onTarget, onSave, onClose }: {
  job: GameJob; drafts: { key: string; nombre: string; raw: Est[] }[];
  onTarget(t: string): void; onSave(): void; onClose(): void;
}) {
  const { snap, rowsByClase, juegoByClase } = useApp();
  const [open, setOpen] = useState(false);
  const { jugadores, equipos } = job.data;
  const destino = job.target.startsWith("clase:") ? (rowsByClase.get(job.target.slice(6)) ?? []).map((r) => r.r)
    : job.target.startsWith("draft:") ? drafts.find((d) => "draft:" + d.key === job.target)?.raw ?? [] : [];
  const links = useMemo(() => linkJugadores(jugadores, destino), [jugadores, destino]);
  const ok = links.filter((k) => k >= 0).length;
  const sin = jugadores.filter((_, i) => links[i] < 0);
  const total = jugadores.reduce((a, j) => a + (j.minutos ?? 0), 0);
  const yaTiene = job.target.startsWith("clase:") && (juegoByClase.get(job.target.slice(6))?.jugadores.length ?? 0) > 0;
  const top = [...equipos].sort((a, b) => (b.bsc_acum ?? -1) - (a.bsc_acum ?? -1));

  return (
    <section className="card pad listcard gamecard">
      <div className="card-h">
        <div className="rank-txt"><b><Icon name="bolt" size={16} /> {job.fileName}</b><small>Desempeño en el juego (tiempo, Scorecard y puntajes)</small></div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
      </div>
      <div className="merge-stats">
        <span className="ms info"><b>{jugadores.length}</b> jugadores</span>
        <span className="ms"><b>{equipos.length}</b> equipos</span>
        <span className="ms"><b>{fmtMin(total)}</b> de juego en total</span>
        {job.target && <span className={"ms " + (ok === jugadores.length ? "good" : "warn")}><b>{ok}</b> de {jugadores.length} enlazados con sus estudiantes</span>}
      </div>
      <label className="replace-row">
        <span className="muted small">Pertenece a</span>
        <select value={job.target} onChange={(e) => onTarget(e.target.value)} disabled={job.saved}>
          <option value="">— Elige la clase —</option>
          {drafts.length > 0 && <optgroup label="Clases nuevas de este lote">{drafts.map((d) => <option key={d.key} value={"draft:" + d.key}>{d.nombre} (nueva)</option>)}</optgroup>}
          <optgroup label="Clases guardadas">{snap.clases.map((c) => <option key={c.id} value={"clase:" + c.id}>{c.nombre}</option>)}</optgroup>
        </select>
      </label>
      {yaTiene && !job.saved && <p className="note small">Esta clase ya tiene desempeño cargado: se reemplazará por el de este archivo.</p>}
      {sin.length > 0 && job.target && (
        <p className="small muted">Sin estudiante en la clase: {sin.slice(0, 6).map((j) => displayName(j.nombre)).join(", ")}{sin.length > 6 ? ` y ${sin.length - 6} más` : ""}. Se guardan igual; aparecerán al subir su informe de competencias.</p>
      )}
      <button className="link small" onClick={() => setOpen(!open)}>{open ? "Ocultar equipos" : `Ver los ${equipos.length} equipos`}</button>
      {open && (
        <div className="ctable">
          {top.map((e) => (
            <div className="ct-row" key={e.equipo}><span>{e.equipo}</span><span className="muted">{fmtMin(e.minutos)}</span>
              <span className="muted small">Scorecard {fmt(e.bsc_acum)} · último {fmt(e.bsc)}</span><b>{e.puntaje !== null ? fmt(e.puntaje) : "—"}</b></div>
          ))}
        </div>
      )}
      <div className="row-gap wrap" style={{ marginTop: 10 }}>
        {job.saved ? <span className="ms good"><Icon name="check" size={13} /> Guardado</span>
          : job.target.startsWith("draft:") ? <span className="muted small">Se guardará junto con esa clase al pulsar <b>Guardar</b> arriba.</span>
          : <button className="btn primary sm" disabled={!job.target} onClick={onSave}>Guardar desempeño</button>}
        <span className="muted tiny">{plural(equipos.filter((e) => e.percentil !== null).length, "equipo con percentil", "equipos con percentil")}</span>
      </div>
    </section>
  );
}
