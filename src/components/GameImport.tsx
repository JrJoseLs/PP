/* Tarjeta de importación del desempeño en el juego (informes «igrades» e «itimespent»):
   sugiere la clase por equipos y estudiantes en común, muestra cuántos jugadores se enlazan,
   une los informes del mismo juego y permite crear la clase si aún no existe. */
import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Avatar, Icon } from "./ui";
import { claseNameFromGame, fmtMin, gameCode, gameQuarter, linkJugadores, mergeIgrades, mismoJuego, scoreClase, trimestresDe, type Igrades } from "../lib/game";
import { D } from "../lib/labels";
import { displayName, fmt, plural } from "../lib/metrics";
import type { Resultado } from "../lib/types";

export interface NuevaClase { nombre: string; grupo: string; periodo: string; decanos: string[]; }
export interface GameJob {
  key: string; fileName: string; files: string[]; code: string | null; q: number;
  data: Igrades; target: string; nueva: NuevaClase; saved?: boolean;
  /** Nombre de la clase en Marketplace que mandó la extensión («jser-MKTJun26»): solo una sugerencia */
  pista?: string;
  /** Cuántas clases guardadas se llaman igual que la pista (más de una = el usuario elige) */
  ambiguo?: number;
}
type Est = Pick<Resultado, "nombre" | "matricula" | "equipo" | "grupo">;

export function newGameJob(fileName: string, data: Igrades): GameJob {
  return { key: fileName + Date.now() + Math.random(), fileName, files: [fileName], code: gameCode(fileName), q: gameQuarter(fileName), data, target: "",
    nueva: { nombre: claseNameFromGame(fileName), grupo: "", periodo: "", decanos: [] } };
}

/** Une en una sola tarjeta los informes del mismo juego (igrades + itimespent, o varios trimestres). El más reciente manda. */
export function mergeGameJobs(list: GameJob[]): { jobs: GameJob[]; unidos: number } {
  const out: GameJob[] = [];
  let unidos = 0;
  for (const j of list) {
    const k = j.code && !j.saved ? out.findIndex((x) => !x.saved && x.code === j.code) : -1;
    if (k < 0) { out.push(j); continue; }
    const a = out[k], nuevoManda = j.q >= a.q;
    out[k] = { ...a, files: [...a.files, ...j.files], fileName: [...a.files, ...j.files].join(" + "), q: Math.max(a.q, j.q),
      data: nuevoManda ? mergeIgrades(a.data, j.data) : mergeIgrades(j.data, a.data), target: a.target || j.target };
    unidos++;
  }
  return { jobs: out, unidos };
}

/** Mejor clase (o borrador del mismo lote) para un informe del juego; «nueva» si ninguna se parece */
export function suggestTarget(data: Igrades, clases: { id: string; rows: Est[] }[], drafts: { key: string; raw: Est[] }[]) {
  const best = [...clases.map((c) => ({ id: "clase:" + c.id, rows: c.rows })), ...drafts.map((d) => ({ id: "draft:" + d.key, rows: d.raw }))]
    .map((c) => ({ id: c.id, ...scoreClase(data, c.rows) })).sort((a, b) => b.score - a.score)[0];
  // un par de nombres de equipo repetidos no bastan: hace falta enlazar estudiantes o compartir la mayoría de los equipos
  const parecida = best && (best.enlazados >= Math.max(2, data.jugadores.length * 0.3) || best.comunes >= Math.max(2, data.equipos.length * 0.5));
  return parecida ? best.id : "nueva";
}

export function GameCard({ job, drafts, onTarget, onNueva, onSave, onClose }: {
  job: GameJob; drafts: { key: string; nombre: string; raw: Est[] }[];
  onTarget(t: string): void; onNueva(p: Partial<NuevaClase>): void; onSave(): void; onClose(): void;
}) {
  const { snap, rowsByClase, juegoByClase } = useApp();
  const [open, setOpen] = useState(false);
  const { jugadores, equipos } = job.data;
  const esNueva = job.target === "nueva";
  const destino = job.target.startsWith("clase:") ? (rowsByClase.get(job.target.slice(6)) ?? []).map((r) => r.r)
    : job.target.startsWith("draft:") ? drafts.find((d) => "draft:" + d.key === job.target)?.raw ?? [] : [];
  const links = useMemo(() => linkJugadores(jugadores, destino), [jugadores, destino]);
  const ok = esNueva ? jugadores.length : links.filter((k) => k >= 0).length;
  const sin = esNueva ? [] : jugadores.filter((_, i) => links[i] < 0);
  const total = jugadores.reduce((a, j) => a + (j.minutos ?? 0), 0);
  const prev = job.target.startsWith("clase:") ? juegoByClase.get(job.target.slice(6)) : undefined;
  const yaTiene = (prev?.jugadores.length ?? 0) > 0;
  const suma = yaTiene && mismoJuego(prev!, job.data);
  const tPrev = suma ? trimestresDe([...prev!.equipos, ...prev!.jugadores]) : [];
  const tNuevo = trimestresDe([...equipos, ...jugadores]);
  // «T1, T2, T3, T5» → «T1–T3, T5»
  const lista = (ts: number[]) => ts.reduce<number[][]>((g, t) => { const u = g[g.length - 1]; if (u && t === u[u.length - 1] + 1) u.push(t); else g.push([t]); return g; }, [])
    .map((g) => (g.length > 1 ? `T${g[0]}–T${g[g.length - 1]}` : "T" + g[0])).join(", ");
  const corte = tNuevo.length ? Math.max(...tNuevo) : job.q;
  const top = [...equipos].sort((a, b) => (b.bsc_acum ?? -1) - (a.bsc_acum ?? -1));
  const conTrim = jugadores.some((j) => j.tiempos?.length);
  const decanos = snap.profiles.filter((p) => p.rol === "decano" && p.activo);

  return (
    <section className="card pad listcard gamecard">
      <div className="card-h">
        <div className="rank-txt"><b><Icon name="bolt" size={16} /> {job.fileName}</b>
          <small>Desempeño en el juego{job.code ? ` ${job.code}` : ""}{job.files.length > 1 ? ` · ${job.files.length} informes unidos en uno` : ""}</small></div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
      </div>
      <div className="merge-stats">
        <span className="ms info"><b>{jugadores.length}</b> jugadores</span>
        <span className="ms"><b>{equipos.length}</b> equipos</span>
        <span className="ms"><b>{fmtMin(total)}</b> de juego en total</span>
        {corte > 0 && <span className="ms" title={tNuevo.length > 1 ? `Algunos equipos tienen su último resultado en: ${lista(tNuevo)}` : undefined}>corte del <b>trimestre {corte}</b></span>}
        {conTrim && <span className="ms"><Icon name="check" size={13} /> tiempo por trimestre</span>}
        {job.target && !esNueva && <span className={"ms " + (ok === jugadores.length ? "good" : "warn")}><b>{ok}</b> de {jugadores.length} enlazados con sus estudiantes</span>}
      </div>
      <label className="replace-row">
        <span className="muted small">Pertenece a</span>
        <select value={job.target} onChange={(e) => onTarget(e.target.value)} disabled={job.saved}>
          <option value="">— Elige la clase —</option>
          <option value="nueva">＋ Crear clase nueva con estos jugadores</option>
          {drafts.length > 0 && <optgroup label="Clases nuevas de este lote">{drafts.map((d) => <option key={d.key} value={"draft:" + d.key}>{d.nombre} (nueva)</option>)}</optgroup>}
          <optgroup label="Clases guardadas">{snap.clases.map((c) => <option key={c.id} value={"clase:" + c.id}>{c.nombre}</option>)}</optgroup>
        </select>
      </label>
      {esNueva && !job.saved && (
        <div className="gc-nueva">
          <input className="title-input" value={job.nueva.nombre} onChange={(e) => onNueva({ nombre: e.target.value })} aria-label="Nombre de la clase nueva" />
          <div className="draft-meta">
            <label>Grupo <input value={job.nueva.grupo} onChange={(e) => onNueva({ grupo: e.target.value })} /></label>
            <label>Periodo <input value={job.nueva.periodo} placeholder="2026-2" onChange={(e) => onNueva({ periodo: e.target.value })} /></label>
          </div>
          {decanos.length > 0 && (
            <div className="chips">
              <span className="muted small">{D().one}:</span>
              {decanos.map((p) => { const on = job.nueva.decanos.includes(p.id); return (
                <button type="button" key={p.id} className={"pchip" + (on ? " on" : "")} onClick={() => onNueva({ decanos: on ? job.nueva.decanos.filter((x) => x !== p.id) : [...job.nueva.decanos, p.id] })}>
                  <Avatar name={p.nombre} size={20} /><span>{p.nombre}</span>{on && <Icon name="check" size={13} />}</button>); })}
            </div>
          )}
          <p className="note small">Se crea la clase con sus {plural(jugadores.length, "jugador", "jugadores")} como estudiantes, todavía sin competencias. Cuando subas su informe de competencias (<code>icompetencyreport-{job.code ?? "…"}</code>), elige «Reemplazar datos de» esta clase y se completará la araña.</p>
        </div>
      )}
      {job.pista && !job.saved && (job.ambiguo
        ? <p className="note small">Marketplace indica la clase «{job.pista}», pero hay {job.ambiguo} clases con ese nombre: elige cuál en «Pertenece a».</p>
        : <p className="muted small">Clase indicada por Marketplace: <b>{job.pista}</b>. Revisa que sea correcta antes de guardar.</p>)}
      {yaTiene && !job.saved && (suma
        ? <p className="note small">Esta clase ya tiene {tPrev.length ? `${tPrev.length > 1 ? "los trimestres" : "el trimestre"} ${lista(tPrev)}` : "desempeño"} de este juego: {corte ? `se añade el trimestre ${corte}` : "se actualiza"} y se conserva el historial para comparar trimestres.</p>
        : <p className="note small">Esta clase ya tiene desempeño de otro juego: se reemplazará por el de este archivo.</p>)}
      {sin.length > 0 && job.target && (
        <p className="small muted">{sin.length === jugadores.length ? "Ninguno de estos jugadores está en la clase elegida: ¿es otra clase? Prueba «Crear clase nueva». " : ""}
          Sin estudiante en la clase: {sin.slice(0, 6).map((j) => displayName(j.nombre)).join(", ")}{sin.length > 6 ? ` y ${sin.length - 6} más` : ""}. Se guardan igual; aparecerán al subir su informe de competencias.</p>
      )}
      <button className="link small" onClick={() => setOpen(!open)}>{open ? "Ocultar equipos" : `Ver los ${equipos.length} equipos`}</button>
      {open && (
        <div className="ctable">
          {top.map((e) => (
            <div className="ct-row" key={e.equipo}><span>{e.equipo}</span><span className="muted">{fmtMin(e.minutos)}</span>
              <b>Scorecard {fmt(e.bsc_acum)}</b></div>
          ))}
        </div>
      )}
      <div className="row-gap wrap" style={{ marginTop: 10 }}>
        {job.saved ? <span className="ms good"><Icon name="check" size={13} /> Guardado</span>
          : job.target.startsWith("draft:") ? <span className="muted small">Se guardará junto con esa clase al pulsar <b>Guardar</b> abajo.</span>
          : <button className="btn primary sm" disabled={!job.target || (esNueva && !job.nueva.nombre.trim())} onClick={onSave}>{esNueva ? "Crear clase y guardar desempeño" : "Guardar desempeño"}</button>}
      </div>
    </section>
  );
}
