/* Corrección manual de resultados (solo administración):
   - EditStudentModal: datos y competencias de un estudiante, con el índice recalculado al vuelo.
   - GridEditor: la clase como hoja de cálculo (estudiantes × competencias); añadir, quitar y guardar en bloque.
   - ReuploadButton: subir el Excel corregido de una clase con vista previa de lo que cambia.
     A diferencia de «Reemplazar» en Importar, conserva matrícula, carrera y equipo de quienes ya estaban. */
import { useMemo, useRef, useState } from "react";
import { useApp } from "../data/store";
import { Icon, Modal } from "./ui";
import { Directory } from "../lib/directory";
import { readSheet, parseReport } from "../lib/parse";
import { displayName, fmt, generalIndex, isRisk, normText, plural, type Row } from "../lib/metrics";
import { metricDesc, metricName } from "../lib/labels";
import { friendlyError } from "../data/api";
import type { Clase, Resultado } from "../lib/types";

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "r-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100) / 100));
const num = (s: string) => { const n = parseFloat(s.replace(",", ".")); return isNaN(n) ? 0 : clamp(n); };
type Campo = "nombre" | "matricula" | "carrera" | "grupo" | "equipo";
const CAMPOS: { k: Campo; label: string }[] = [
  { k: "nombre", label: "Nombre" }, { k: "matricula", label: "Matrícula" }, { k: "carrera", label: "Carrera" }, { k: "grupo", label: "Grupo" }, { k: "equipo", label: "Equipo" },
];

/* =====================================================================
   1. Editar un estudiante
   ===================================================================== */
export function EditStudentModal({ row, onClose }: { row: Row; onClose(): void }) {
  const { run, snap } = useApp();
  const c = row.cls;
  const [f, setF] = useState({ nombre: row.r.nombre, matricula: row.r.matricula, carrera: row.r.carrera, grupo: row.r.grupo, equipo: row.r.equipo ?? "" });
  const [vals, setVals] = useState<string[]>(row.r.valores.map((v) => String(v ?? 0)));
  const [busy, setBusy] = useState(false);
  const valores = vals.map(num);
  const idx = generalIndex(c.metrics, valores);
  const changed = c.metrics.filter((_, i) => Math.abs(valores[i] - (row.r.valores[i] ?? 0)) > 0.004).length;

  const save = async () => {
    if (!f.nombre.trim()) return;
    setBusy(true);
    const ok = await run((a) => a.updateResultado(row.r.id, { ...f, nombre: f.nombre.trim(), carrera: f.carrera.trim(), valores }), "Estudiante actualizado");
    setBusy(false);
    if (ok !== false) onClose();
  };
  const remove = async () => {
    if (!confirm(`¿Quitar a ${displayName(row.r.nombre)} de «${c.nombre}»? Se borran sus resultados de esta clase.`)) return;
    if (await run((a) => a.saveResultados(c.id, [], [row.r.id]), "Estudiante quitado de la clase") !== false) onClose();
  };

  return (
    <Modal open wide title="Editar estudiante" onClose={onClose}>
      <div className="form">
        <div className="edit-grid">
          {CAMPOS.map(({ k, label }) => (
            <label key={k} className={"field" + (k === "nombre" ? " span2" : "")}><span>{label}</span>
              <input value={f[k]} list={k === "carrera" ? "edit-carreras" : undefined} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
          ))}
          <datalist id="edit-carreras">{snap.carreras.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}</datalist>
        </div>
        <div className="edit-sum">
          <span>Índice general <b>{fmt(idx)}</b>{row.indice !== null && idx !== null && Math.abs(idx - row.indice) > 0.04 && <small className="muted"> (antes {fmt(row.indice)})</small>}</span>
          {changed > 0 && <span className="ms info"><b>{changed}</b> {changed === 1 ? "competencia cambiada" : "competencias cambiadas"}</span>}
        </div>
        <div className="metric-inputs">
          {c.metrics.map((m, i) => {
            const dirty = Math.abs(valores[i] - (row.r.valores[i] ?? 0)) > 0.004;
            return (
              <label key={m} className={"mi" + (dirty ? " chg" : "")} title={metricDesc(m)}>
                <span className={isRisk(m) ? "risk" : ""}>{metricName(m)}{isRisk(m) ? " ↓" : ""}</span>
                <input type="number" min={0} max={100} step="0.01" value={vals[i]} onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))} />
              </label>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn danger ghost" onClick={remove}><Icon name="trash" size={16} /> Quitar de la clase</button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" disabled={busy || !f.nombre.trim()} onClick={save}>{busy ? <span className="spinner" /> : "Guardar"}</button>
        </div>
      </div>
    </Modal>
  );
}

/* =====================================================================
   2. La clase como hoja de cálculo
   ===================================================================== */
interface Rec extends Resultado { _new?: boolean; _del?: boolean; }

export function GridEditor({ cls, rows, onDone }: { cls: Clase; rows: Row[]; onDone(): void }) {
  const { run } = useApp();
  const orig = useMemo(() => new Map(rows.map((r) => [r.r.id, r.r])), [rows]);
  const [list, setList] = useState<Rec[]>(() => [...rows].sort((a, b) => displayName(a.r.nombre).localeCompare(displayName(b.r.nombre), "es"))
    .map((r) => ({ ...r.r, equipo: r.r.equipo ?? "", valores: [...r.r.valores] })));
  const [busy, setBusy] = useState(false);
  const table = useRef<HTMLTableElement>(null);

  const isChanged = (r: Rec) => {
    if (r._new || r._del) return true;
    const o = orig.get(r.id); if (!o) return true;
    return CAMPOS.some(({ k }) => (r[k] ?? "") !== (o[k] ?? "")) || r.valores.some((v, i) => Math.abs(v - (o.valores[i] ?? 0)) > 0.004);
  };
  const cambios = list.filter(isChanged).length;
  const set = (id: string, patch: Partial<Rec>) => setList((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => setList((l) => [{ id: newId(), clase_id: cls.id, nombre: "", matricula: "", carrera: "", grupo: cls.grupo, equipo: "", valores: cls.metrics.map(() => 0), _new: true }, ...l]);
  // Enter baja a la misma columna de la fila siguiente, como en Excel
  const nav = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = e.currentTarget, r = +t.dataset.r! + (e.shiftKey ? -1 : 1);
    table.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${t.dataset.c}"]`)?.focus();
  };
  const save = async () => {
    const vivos = list.filter((r) => !r._del);
    if (vivos.some((r) => !r.nombre.trim())) { alert("Hay estudiantes sin nombre. Escríbelo o quita esa fila."); return; }
    setBusy(true);
    const upserts = vivos.filter(isChanged).map(({ _new, _del, ...r }) => ({ ...r, nombre: r.nombre.trim() }));
    const deletes = list.filter((r) => r._del && !r._new).map((r) => r.id);
    const ok = await run((a) => a.saveResultados(cls.id, upserts, deletes), `${plural(upserts.length + deletes.length, "cambio guardado", "cambios guardados")}`);
    setBusy(false);
    if (ok !== false) onDone();
  };

  return (
    <div className="grid-editor">
      <div className="ge-bar">
        <button className="btn sm" onClick={add}><Icon name="plus" size={14} /> Estudiante</button>
        <span className="muted small">Edita como en Excel: <kbd>Tab</kbd> avanza, <kbd>Enter</kbd> baja. Las celdas cambiadas se resaltan.</span>
        <span className="grow" />
        <button className="btn sm" onClick={() => { if (!cambios || confirm("¿Descartar los cambios?")) onDone(); }}>Cancelar</button>
        <button className="btn primary sm" disabled={!cambios || busy} onClick={save}>{busy ? <span className="spinner" /> : `Guardar${cambios ? ` (${cambios})` : ""}`}</button>
      </div>
      <div className="table-scroll">
        <table className="etable ge" ref={table}>
          <thead><tr>
            <th className="sticky ge-name">Estudiante</th>
            {CAMPOS.slice(1).map(({ k, label }) => <th key={k}>{label}</th>)}
            <th className="num">Índice</th>
            {cls.metrics.map((m) => <th key={m} className={"vert" + (isRisk(m) ? " risk" : "")} title={metricName(m)}><span>{metricName(m)}{isRisk(m) ? " ↓" : ""}</span></th>)}
            <th />
          </tr></thead>
          <tbody>
            {list.map((r, ri) => {
              const o = orig.get(r.id);
              const cell = (k: Campo) => (r._new || (o && (o[k] ?? "") !== (r[k] ?? "")) ? " chg" : "");
              const idx = generalIndex(cls.metrics, r.valores);
              return (
                <tr key={r.id} className={(r._del ? "del" : "") + (r._new ? " nuevo" : "")}>
                  <td className="sticky ge-name"><input className={"cell" + cell("nombre")} value={r.nombre} placeholder="Nombre del estudiante" data-r={ri} data-c="nombre" onKeyDown={nav} onChange={(e) => set(r.id, { nombre: e.target.value })} /></td>
                  {CAMPOS.slice(1).map(({ k }) => (
                    <td key={k}><input className={"cell sm" + cell(k)} value={r[k] ?? ""} data-r={ri} data-c={k} onKeyDown={nav} onChange={(e) => set(r.id, { [k]: e.target.value })} /></td>
                  ))}
                  <td className="num"><b>{fmt(idx)}</b></td>
                  {cls.metrics.map((m, i) => {
                    const chg = r._new || (o && Math.abs((o.valores[i] ?? 0) - r.valores[i]) > 0.004);
                    return (
                      <td key={m}><input className={"cell n" + (chg ? " chg" : "")} type="number" min={0} max={100} step="0.01" value={r.valores[i]}
                        data-r={ri} data-c={"m" + i} onKeyDown={nav} title={o && chg ? `Antes: ${fmt(o.valores[i])}` : metricName(m)}
                        onChange={(e) => set(r.id, { valores: r.valores.map((v, j) => (j === i ? num(e.target.value) : v)) })} /></td>
                    );
                  })}
                  <td><button className="icon-btn sm" title={r._del ? "Recuperar" : "Quitar de la clase"} onClick={() => (r._new ? setList((l) => l.filter((x) => x.id !== r.id)) : set(r.id, { _del: !r._del }))}>
                    <Icon name={r._del ? "back" : "trash"} size={15} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =====================================================================
   3. Subir el Excel corregido de una clase
   ===================================================================== */
interface Plan { file: string; upserts: Resultado[]; deletes: string[]; cambios: { nombre: string; detalle: string }[]; nuevos: string[]; ausentes: Resultado[]; sinCambio: number; extra: string[]; }

export function ReuploadButton({ cls, rows }: { cls: Clase; rows: Row[] }) {
  const { run, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [quitar, setQuitar] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (file: File) => {
    try {
      const rep = parseReport(await readSheet(file));
      if (!rep) { toast(`"${file.name}" no parece un informe (falta la columna «Estudiante»).`, "error"); return; }
      // las competencias se emparejan por nombre: el orden del archivo puede ser otro
      const pos = cls.metrics.map((m) => rep.metrics.findIndex((x) => normText(x) === normText(m)));
      const extra = rep.metrics.filter((x) => !cls.metrics.some((m) => normText(m) === normText(x)));
      const actuales = rows.map((r) => r.r);
      const dir = new Directory(actuales.map((r) => ({ nombre: r.nombre, matricula: r.matricula, carrera: r.carrera, grupo: r.grupo, equipo: r.equipo ?? "" })));
      const usados = new Set<string>();
      const p: Plan = { file: file.name, upserts: [], deletes: [], cambios: [], nuevos: [], ausentes: [], sinCambio: 0, extra };
      for (const s of rep.students) {
        const f = dir.find({ nombre: s.nombre, matricula: s.matricula, equipo: s.equipo, grupo: s.grupo });
        const old = f.e && (f.seguro || f.how !== "nombre") ? actuales[dir.list.indexOf(f.e)] : null;
        const valores = cls.metrics.map((_, i) => (pos[i] >= 0 ? s.valores[pos[i]] : old?.valores[i] ?? 0));
        if (old && !usados.has(old.id)) {
          usados.add(old.id);
          const diffs = cls.metrics.map((m, i) => ({ m, a: old.valores[i] ?? 0, b: valores[i] })).filter((d) => Math.abs(d.a - d.b) > 0.004);
          const r: Resultado = { ...old, valores, matricula: s.matricula || old.matricula, carrera: s.carrera || old.carrera, grupo: s.grupo || old.grupo, equipo: s.equipo || old.equipo || "" };
          const otros = r.matricula !== old.matricula || r.carrera !== old.carrera || r.grupo !== old.grupo || r.equipo !== (old.equipo ?? "");
          if (diffs.length || otros) {
            p.upserts.push(r);
            p.cambios.push({ nombre: old.nombre, detalle: diffs.length ? diffs.slice(0, 3).map((d) => `${metricName(d.m)} ${fmt(d.a)}→${fmt(d.b)}`).join(" · ") + (diffs.length > 3 ? ` y ${diffs.length - 3} más` : "") : "datos de matrícula, carrera, grupo o equipo" });
          } else p.sinCambio++;
        } else {
          p.upserts.push({ id: newId(), clase_id: cls.id, nombre: s.nombre, matricula: s.matricula, carrera: s.carrera, grupo: s.grupo || cls.grupo, equipo: s.equipo ?? "", valores });
          p.nuevos.push(s.nombre);
        }
      }
      p.ausentes = actuales.filter((r) => !usados.has(r.id));
      setQuitar(false);
      setPlan(p);
    } catch (e) { toast(friendlyError(e), "error"); }
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    const deletes = quitar ? plan.ausentes.map((r) => r.id) : [];
    const ok = await run((a) => a.saveResultados(cls.id, plan.upserts, deletes), `Clase actualizada desde «${plan.file}»`);
    setBusy(false);
    if (ok !== false) setPlan(null);
  };
  const nada = plan && !plan.upserts.length && !(quitar && plan.ausentes.length);

  return (
    <>
      <button className="btn" onClick={() => input.current?.click()} title="Sube el Excel de esta clase con correcciones: verás qué cambia antes de aplicarlo">
        <Icon name="upload" size={16} /> Subir corregido</button>
      <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
      {plan && (
        <Modal open wide title={`Cambios desde «${plan.file}»`} onClose={() => setPlan(null)}>
          <div className="merge-stats">
            <span className="ms info"><b>{plan.cambios.length}</b> con cambios</span>
            <span className="ms good"><b>{plan.nuevos.length}</b> nuevos</span>
            <span className="ms"><b>{plan.sinCambio}</b> sin cambios</span>
            {plan.ausentes.length > 0 && <span className="ms warn"><b>{plan.ausentes.length}</b> no están en el archivo</span>}
          </div>
          {plan.cambios.length > 0 && (
            <div className="plan-list"><h4 className="sub-h">Calificaciones y datos que cambian</h4>
              <ul>{plan.cambios.slice(0, 12).map((c, i) => <li key={i}><b>{displayName(c.nombre)}</b><span className="muted">{c.detalle}</span></li>)}</ul>
              {plan.cambios.length > 12 && <p className="muted tiny">…y {plan.cambios.length - 12} más.</p>}
            </div>
          )}
          {plan.nuevos.length > 0 && <p className="small"><b>Nuevos:</b> {plan.nuevos.slice(0, 8).map(displayName).join(", ")}{plan.nuevos.length > 8 ? "…" : ""}</p>}
          {plan.ausentes.length > 0 && (
            <label className="switch-label"><input type="checkbox" className="switch" checked={quitar} onChange={(e) => setQuitar(e.target.checked)} />
              Quitar de la clase a los {plan.ausentes.length} que no están en el archivo</label>
          )}
          {plan.extra.length > 0 && <p className="muted tiny">Se ignoran {plural(plan.extra.length, "columna", "columnas")} que esta clase no tiene: {plan.extra.join(", ")}.</p>}
          <p className="muted tiny">Se conservan la matrícula, la carrera y el equipo de quienes ya estaban, salvo que el archivo traiga otros.</p>
          <div className="modal-actions">
            <span className="grow" />
            <button className="btn" onClick={() => setPlan(null)}>Cancelar</button>
            <button className="btn primary" disabled={busy || !!nada} onClick={apply}>{busy ? <span className="spinner" /> : nada ? "No hay cambios" : "Aplicar cambios"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
