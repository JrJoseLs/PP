import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { useShell } from "../components/Layout";
import { Avatar, Delta, Empty, Icon, LevelChip, Modal, Segmented, Stat } from "../components/ui";
import { Radar, type Series } from "../components/Radar";
import { Histogram, LevelBar, Ring } from "../components/Charts";
import { avgIndex, avgVector, displayName, fmt, isRisk, levelCounts, plural, sparseMetrics, stdev, type Row } from "../lib/metrics";
import { byField } from "../lib/groups";
import { PageHead } from "./Dashboard";
import { downloadClase } from "../lib/templates";
import { PALETTE } from "../data/demoSeed";
import type { Clase, Profile } from "../lib/types";

export default function ClaseDetalle() {
  const { id } = useParams();
  const { snap, rows, rowsByClase, user, run } = useApp();
  const { openStudent } = useShell();
  const go = useNavigate();
  const [invert, setInvert] = usePref("radarInvert", true);
  const [vs, setVs] = useState<"general" | "carreras">("general");
  const [sort, setSort] = useState<{ k: "nombre" | "indice" | "carrera"; dir: 1 | -1 }>({ k: "indice", dir: -1 });
  const [edit, setEdit] = useState(false);
  const c = snap.clases.find((x) => x.id === id);
  const rol = user!.rol;

  const d = useMemo(() => {
    if (!c) return null;
    const rr = rowsByClase.get(c.id) ?? [];
    const vec = avgVector(rr, c.metrics), all = avgVector(rows, c.metrics);
    const sparse = sparseMetrics(rr, c.metrics);
    const comp = c.metrics.map((m, i) => ({ m, v: vec[i], d: vec[i] !== null && all[i] !== null ? vec[i]! - all[i]! : null })).filter((x) => !sparse.has(x.m));
    const idxs = rr.map((r) => r.indice).filter((x): x is number => x !== null);
    return { labels: c.metrics.filter((m) => !sparse.has(m)), rr, vec, all, comp, idx: avgIndex(rr), sd: stdev(idxs), lv: levelCounts(rr), carreras: byField(rr, "carrera") };
  }, [c, rows, rowsByClase]);

  if (!c || !d) return <Empty icon="classes" title="Clase no encontrada"><Link className="btn" to="/clases">Volver a clases</Link></Empty>;

  const sorted = [...d.rr].sort((a, b) => {
    const k = sort.k;
    const v = k === "nombre" ? displayName(a.r.nombre).localeCompare(displayName(b.r.nombre), "es") : k === "carrera" ? a.carrera.localeCompare(b.carrera, "es") : (a.indice ?? -1) - (b.indice ?? -1);
    return v * sort.dir;
  });
  const pick = (v: (number | null)[]) => d.labels.map((m) => v[c.metrics.indexOf(m)]) as number[];
  const series: Series[] = vs === "general"
    ? [{ name: c.nombre, color: c.color, values: pick(d.vec) }, ...(snap.clases.length > 1 ? [{ name: "Todas mis clases", color: "var(--text-3)", values: pick(d.all), dash: true, muted: true }] : [])]
    : d.carreras.slice(0, 8).map((g) => ({ name: g.label, color: g.color, values: pick(avgVector(g.rows, c.metrics)) }));
  const pos = d.comp.filter((x) => !isRisk(x.m) && x.v !== null).sort((a, b) => b.v! - a.v!);
  const th = (k: typeof sort.k, label: string) => (
    <button className={"th" + (sort.k === k ? " on" : "")} onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : k === "indice" ? -1 : 1 })}>
      {label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>);

  return (
    <>
      <Link to="/clases" className="back"><Icon name="back" size={16} /> Clases</Link>
      <PageHead eyebrow={<><span className="dot" style={{ background: c.color }} /> Grupo {c.grupo || "—"}{c.periodo ? " · " + c.periodo : ""}</>}
        title={c.nombre} sub={c.archivo ? <span className="muted small">Archivo: {c.archivo}</span> : undefined}
        actions={<>
          <button className="btn" onClick={() => downloadClase(c, d.rr.map((r) => r.r))} title="Mismo formato que la plantilla: edítalo y vuelve a subirlo en Importar"><Icon name="download" size={16} /> Descargar Excel</button>
          <button className="btn" onClick={() => go("/comparar?add=" + encodeURIComponent("clase:" + c.id))}><Icon name="compare" size={16} /> Comparar</button>
          {rol === "admin" && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" size={16} /> Editar</button>}
        </>} />

      <div className="stats">
        <Stat label="Índice de la clase" value={<span className="row-gap"><Ring value={d.idx} size={52} stroke={6} />{fmt(d.idx)}</span>}
          sub={d.sd !== null ? `Dispersión ±${fmt(d.sd)}` : undefined} />
        <Stat label="Estudiantes" value={d.rr.length} sub={plural(d.carreras.length, "carrera", "carreras")} />
        <Stat label="Nivel alto" value={d.lv.alto} tone="good" sub={d.lv.total ? Math.round((d.lv.alto / d.lv.total) * 100) + "% de la clase" : ""} />
        <Stat label="Necesitan apoyo" value={d.lv.bajo} tone="bad" sub={d.lv.total ? Math.round((d.lv.bajo / d.lv.total) * 100) + "% de la clase" : ""} />
      </div>

      {rol !== "maestro" && <Access c={c} />}

      <div className="grid-main">
        <section className="card pad">
          <div className="card-h">
            <h3>Perfil de la clase</h3>
            <Segmented size="sm" value={vs} onChange={setVs} options={[{ value: "general", label: "vs promedio" }, { value: "carreras", label: "por carrera" }]} />
          </div>
          <Radar labels={d.labels} series={series} invert={invert} onInvert={setInvert} size={600} />
        </section>
        <section className="card pad">
          <h3>Competencias</h3>
          <p className="muted small">{snap.clases.length > 1 ? "Diferencia frente al promedio de todas tus clases." : "Promedio de la clase."}</p>
          <ul className="ilist dense">{d.comp.map((x) => (
            <li key={x.m}><span className={isRisk(x.m) ? "risk" : ""}>{x.m}{isRisk(x.m) ? " ↓" : ""}</span>
              <span className="v"><span className="minibar"><i style={{ width: (x.v ?? 0) + "%", background: c.color }} /></span>{fmt(x.v)}{snap.clases.length > 1 && <Delta v={x.d} invert={isRisk(x.m)} />}</span></li>))}</ul>
          {pos.length > 1 && <p className="note">Punto fuerte: <b>{pos[0].m}</b>. A reforzar: <b>{pos[pos.length - 1].m}</b>.</p>}
          <h4 className="sub-h">Distribución</h4>
          <Histogram rows={d.rr} color={c.color} />
        </section>
      </div>

      {d.carreras.length > 1 && (
        <section className="card pad">
          <h3>Por carrera</h3>
          <div className="ctable">
            {d.carreras.map((g) => (
              <div className="ct-row" key={g.id}>
                <span><span className="dot" style={{ background: g.color }} /> {g.label}</span>
                <span className="muted">{g.rows.length} est.</span>
                <LevelBar rows={g.rows} />
                <b>{fmt(avgIndex(g.rows))}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-h pad-x"><h3>Estudiantes</h3><span className="muted small">Toca a un estudiante para ver su perfil</span></div>
        <div className="stable">
          <div className="st-row st-h">{th("nombre", "Nombre")}{th("carrera", "Carrera")}{th("indice", "Índice")}<span className="hide-sm">Más fuerte</span><span className="hide-sm">A reforzar</span></div>
          {sorted.map((r) => <StudentRow key={r.r.id} r={r} onOpen={() => openStudent(r.r.id, sorted.map((x) => x.r.id))} />)}
        </div>
      </section>

      {edit && <EditClase c={c} onClose={() => setEdit(false)} onDelete={async () => {
        if (!confirm(`¿Eliminar "${c.nombre}" y sus ${d.rr.length} resultados? Esta acción no se puede deshacer.`)) return;
        await run((a) => a.deleteClase(c.id), "Clase eliminada"); go("/clases");
      }} />}
    </>
  );
}

function StudentRow({ r, onOpen }: { r: Row; onOpen(): void }) {
  const vals = r.cls.metrics.map((m, i) => ({ m, v: r.r.valores[i] })).filter((x) => !isRisk(x.m) && !/F[ÉE]NIX/i.test(x.m)).sort((a, b) => b.v - a.v);
  return (
    <button className="st-row" onClick={onOpen}>
      <span className="st-name"><Avatar name={r.r.nombre} size={28} color={r.cls.color} />{displayName(r.r.nombre)}</span>
      <span className="muted">{r.carrera}</span>
      <span className="st-idx"><b>{fmt(r.indice)}</b><LevelChip v={r.indice} /></span>
      <span className="hide-sm small">{vals[0]?.m}</span>
      <span className="hide-sm small muted">{vals[vals.length - 1]?.m}</span>
    </button>
  );
}

/* ---------- Quién puede ver la clase ---------- */
function Access({ c }: { c: Clase }) {
  const { snap, user, run, person } = useApp();
  const rol = user!.rol;
  const decanos = snap.profiles.filter((p) => p.rol === "decano" && p.activo);
  // el decano solo puede elegir entre SUS maestros; el admin, entre todos
  const maestros = snap.profiles.filter((p) => p.rol === "maestro" && p.activo && (rol === "admin" || p.decano_id === user!.id));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <section className="card pad access">
      <div className="card-h"><h3><Icon name="eye" size={18} /> Quién puede ver esta clase</h3></div>
      {rol === "admin" && (
        <div className="acc-row">
          <span className="acc-l">Decanos</span>
          <div className="chips">
            {decanos.map((p) => <PersonChip key={p.id} p={p} on={c.decanos.includes(p.id)} onClick={() => run((a) => a.setClaseDecanos(c.id, toggle(c.decanos, p.id)))} />)}
            {!decanos.length && <span className="muted small">No hay decanos. Créalos en Equipo.</span>}
          </div>
        </div>
      )}
      <div className="acc-row">
        <span className="acc-l">Maestros</span>
        <div className="chips">
          {maestros.map((p) => <PersonChip key={p.id} p={p} on={c.maestros.includes(p.id)} sub={rol === "admin" ? person(p.decano_id)?.nombre : undefined}
            onClick={() => run((a) => a.setClaseMaestros(c.id, toggle(c.maestros, p.id)))} />)}
          {!maestros.length && <span className="muted small">{rol === "decano" ? "Aún no tienes maestros. Agrégalos en Equipo." : "No hay maestros."}</span>}
        </div>
      </div>
    </section>
  );
}
export function PersonChip({ p, on, onClick, sub }: { p: Profile; on: boolean; onClick(): void; sub?: string }) {
  return (
    <button type="button" className={"pchip" + (on ? " on" : "")} onClick={onClick} aria-pressed={on} title={sub}>
      <Avatar name={p.nombre} size={22} /><span>{p.nombre}</span>{on && <Icon name="check" size={14} />}
    </button>
  );
}

function EditClase({ c, onClose, onDelete }: { c: Clase; onClose(): void; onDelete(): void }) {
  const { run } = useApp();
  const [f, setF] = useState({ nombre: c.nombre, grupo: c.grupo, periodo: c.periodo, color: c.color });
  return (
    <Modal open title="Editar clase" onClose={onClose}>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); await run((a) => a.updateClase(c.id, f), "Clase actualizada"); onClose(); }}>
        <label className="field"><span>Nombre</span><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></label>
        <div className="grid2 tight">
          <label className="field"><span>Grupo</span><input value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })} /></label>
          <label className="field"><span>Periodo</span><input value={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.value })} placeholder="2026-2" /></label>
        </div>
        <div className="field"><span>Color</span><div className="swatches">{PALETTE.map((p) => (
          <button type="button" key={p} className={"swatch" + (f.color === p ? " on" : "")} style={{ background: p }} onClick={() => setF({ ...f, color: p })} aria-label={p} />))}</div></div>
        <div className="modal-actions">
          <button type="button" className="btn danger ghost" onClick={onDelete}><Icon name="trash" size={16} /> Eliminar</button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
