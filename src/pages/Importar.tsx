import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../data/store";
import { Avatar, Icon } from "../components/ui";
import { Radar } from "../components/Radar";
import { findRosterHeader, guessGroup, makeMatcher, parseReport, parseRoster, readSheet } from "../lib/parse";
import { generalIndex, mean, fmt, nameKey, normText, plural } from "../lib/metrics";
import { downloadReportTemplate, downloadRosterTemplate } from "../lib/templates";
import type { ClaseDraft, RosterEntry } from "../lib/types";
import { PALETTE } from "../data/demoSeed";
import { PageHead } from "./Dashboard";
import { D, M, low } from "../lib/labels";
import { friendlyError } from "../data/api";

interface Draft extends ClaseDraft { key: string; replaceId: string; }

export default function Importar() {
  const { api, snap, run, toast, refresh } = useApp();
  const go = useNavigate();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const decanos = snap.profiles.filter((p) => p.rol === "decano" && p.activo);

  useEffect(() => { api.loadRoster().then(setRoster).catch(() => {}); }, [api]);
  useEffect(() => { setNames(Object.fromEntries(snap.carreras.map((c) => [c.codigo, c.nombre]))); }, [snap.carreras]);

  const enrich = (students: ClaseDraft["estudiantes"], list: RosterEntry[]) => {
    const match = makeMatcher(list);
    return students.map((s) => {
      const m = match(s.nombre);
      return { ...s, carrera: s.carrera || m?.carrera || "", grupo: s.grupo || m?.grupo || "", matricula: s.matricula || m?.matricula || "" };
    });
  };

  const handle = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setBusy(`Leyendo ${plural(arr.length, "archivo", "archivos")}…`);
    const parsed: { file: File; rows: unknown[][]; rh: number }[] = [];
    for (const file of arr) {
      try { const rows = await readSheet(file); parsed.push({ file, rows, rh: findRosterHeader(rows) }); }
      catch (e) { toast(`No pude leer "${file.name}": ${friendlyError(e)}`, "error"); }
    }
    // los listados primero, para que los informes del mismo lote ya encuentren la carrera
    let list = roster;
    const rosterFiles = parsed.filter((p) => p.rh >= 0);
    if (rosterFiles.length) {
      const map = new Map(list.map((r) => [r.matricula ? "m" + r.matricula : "n" + nameKey(r.nombre), r]));
      rosterFiles.forEach((p) => parseRoster(p.rows, p.rh).forEach((r) => map.set(r.matricula ? "m" + r.matricula : "n" + nameKey(r.nombre), r)));
      list = [...map.values()];
      setRoster(list);
      try { await api.saveRoster(list); toast(`Listado actualizado: ${list.length} estudiantes`); } catch (e) { toast(friendlyError(e), "error"); }
      setDrafts((ds) => ds.map((d) => ({ ...d, estudiantes: enrich(d.estudiantes, list) })));
    }
    const nd: Draft[] = [];
    parsed.filter((p) => p.rh < 0).forEach((p, i) => {
      const rep = parseReport(p.rows);
      if (!rep && p.rows.some((r) => normText(r?.[0]) === "ESTUDIANTE")) { toast(`"${p.file.name}" no tiene estudiantes. Agrega una fila por estudiante (las filas EJEMPLO se ignoran).`, "error"); return; }
      if (!rep) { toast(`"${p.file.name}" no parece un informe del juego (falta la columna "Estudiante") ni un listado (NOMBRE + CARRERA).`, "error"); return; }
      const est = enrich(rep.students, list);
      const nombre = p.file.name.replace(/\.(xlsx|xls|csv)$/i, "").replace(/^icompetencyreport-?/i, "Clase ").replace(/^plantilla-informe-competencias$/i, "Nueva clase");
      const same = snap.clases.find((c) => normText(c.nombre) === normText(nombre));
      nd.push({ key: p.file.name + Date.now() + i, replaceId: same?.id ?? "", nombre, grupo: guessGroup(est),
        periodo: "", color: PALETTE[(snap.clases.length + drafts.length + i) % PALETTE.length], metrics: rep.metrics, archivo: p.file.name, estudiantes: est, decanos: [] });
    });
    setDrafts((ds) => [...ds, ...nd]);
    setBusy(null);
  };

  const upd = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const codes = useMemo(() => [...new Set([...drafts.flatMap((d) => d.estudiantes.map((s) => s.carrera)), ...roster.map((r) => r.carrera)].filter(Boolean))].sort(), [drafts, roster]);

  const save = async () => {
    setBusy("Guardando clases…");
    let ok = 0;
    for (const d of drafts) {
      const { key: _k, replaceId, ...payload } = d;
      try {
        if (replaceId) await api.replaceResultados(replaceId, { metrics: payload.metrics, estudiantes: payload.estudiantes, archivo: payload.archivo });
        else await api.importClase({ ...payload, nombre: payload.nombre.trim() || payload.archivo });
        ok++;
        setDrafts((ds) => ds.filter((x) => x.key !== d.key));
      }
      catch (e) { toast(`${d.nombre}: ${friendlyError(e)}`, "error"); }
    }
    const changed = codes.filter((c) => (names[c] ?? "") !== (snap.carreras.find((x) => x.codigo === c)?.nombre ?? ""));
    if (changed.length) await api.upsertCarreras(changed.map((c) => ({ codigo: c, nombre: names[c] ?? "" }))).catch(() => {});
    await refresh();
    setBusy(null);
    if (ok) { toast(`${plural(ok, "clase guardada", "clases guardadas")}`); go("/clases"); }
  };

  return (
    <>
      <PageHead title="Importar" sub="Los Excel se leen dentro de tu navegador. Solo se guarda lo necesario: nombre, matrícula, carrera, grupo y competencias." />

      <div className={"drop card" + (drag ? " over" : "") + (busy ? " busy" : "")} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}>
        <div className="drop-ico">{busy ? <span className="spinner lg" /> : <Icon name="upload" size={30} />}</div>
        <h3>{busy ?? "Suelta aquí tus archivos"}</h3>
        <p className="muted">Informes del juego (<code>icompetencyreport…</code>) y listados de estudiantes (<code>ADM535</code>). Se detecta solo cuál es cuál. .xlsx · .xls · .csv</p>
        <input ref={input} type="file" hidden multiple accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }} />
      </div>

      <section className="card pad templates">
        <div className="card-h"><div><h3><Icon name="download" size={18} /> Plantillas Excel</h3>
          <p className="muted small">Descárgalas, llénalas o edítalas y súbelas aquí arriba. Cada una trae una hoja de instrucciones.</p></div></div>
        <div className="tpl-grid">
          <button className="tpl" onClick={() => downloadReportTemplate()}>
            <span className="tpl-ico xl">XLS</span><span className="rank-txt"><b>Informe de competencias</b><small>Una fila por estudiante · 24 competencias</small></span><Icon name="download" size={16} /></button>
          <button className="tpl" onClick={() => downloadRosterTemplate()}>
            <span className="tpl-ico xl">XLS</span><span className="rank-txt"><b>Listado de estudiantes</b><small>Matrícula, nombre, carrera y grupo</small></span><Icon name="download" size={16} /></button>
          <button className="tpl" onClick={() => go("/equipo?importar=1")}>
            <span className="tpl-ico xl alt">XLS</span><span className="rank-txt"><b>Cuentas de usuario</b><small>Crear {low(D().many)} y {low(M().many)} en bloque</small></span><Icon name="chevron" size={16} /></button>
        </div>
        <p className="muted tiny">¿Quieres corregir una clase ya cargada? Ábrela y usa <b>Descargar Excel</b>: sale en este mismo formato, listo para editar y volver a subir.</p>
      </section>

      <div className="grid2">
        <div className="card pad">
          <h3>Listado de estudiantes</h3>
          {roster.length ? <>
            <p><b>{roster.length}</b> estudiantes · {plural(new Set(roster.map((r) => r.carrera).filter(Boolean)).size, "carrera", "carreras")}</p>
            <p className="muted small">Se usa para completar carrera, grupo y matrícula al importar. {api.mode === "cloud" ? "Solo administración puede verlo." : ""}</p>
            <button className="link danger" onClick={async () => { if (!confirm("¿Quitar el listado?")) return; await api.saveRoster([]); setRoster([]); }}>Quitar listado</button>
          </> : <p className="muted">Opcional. Súbelo para que cada estudiante tenga su carrera y grupo automáticamente.</p>}
        </div>
        <div className="card pad">
          <h3>Pasos</h3>
          <ol className="steps">
            <li className={roster.length ? "done" : ""}>Sube el listado (opcional)</li>
            <li className={drafts.length ? "done" : ""}>Sube los informes, uno por clase</li>
            <li>Ponle nombre y elige su {low(D().one)}</li>
            <li>Guarda. Su {low(D().one)} la entregará a sus {low(M().many)}</li>
          </ol>
        </div>
      </div>

      {drafts.length > 0 && <>
        <div className="section-h"><h2>{plural(drafts.length, "clase lista", "clases listas")} para guardar</h2>
          <button className="btn primary" disabled={!!busy} onClick={save}><Icon name="check" size={16} /> Guardar {drafts.length > 1 ? "todas" : ""}</button></div>
        <div className="drafts">
          {drafts.map((d) => {
            const withCar = d.estudiantes.filter((s) => s.carrera).length;
            const idx = mean(d.estudiantes.map((s) => generalIndex(d.metrics, s.valores)));
            const vec = d.metrics.map((_, i) => mean(d.estudiantes.map((s) => s.valores[i])));
            return (
              <div className="card draft" key={d.key} style={{ ["--c" as string]: d.color }}>
                <div className="draft-radar"><Radar compact size={130} labels={d.metrics} series={[{ name: d.nombre, color: d.color, values: vec as number[] }]} /></div>
                <div className="draft-body">
                  <input className="title-input" value={d.nombre} onChange={(e) => upd(d.key, { nombre: e.target.value })} aria-label="Nombre de la clase" />
                  <div className="draft-meta">
                    <label>Grupo <input value={d.grupo} onChange={(e) => upd(d.key, { grupo: e.target.value })} /></label>
                    <label>Periodo <input value={d.periodo} placeholder="2026-2" onChange={(e) => upd(d.key, { periodo: e.target.value })} /></label>
                    <span className="swatches sm">{PALETTE.slice(0, 8).map((p) => <button type="button" key={p} className={"swatch" + (d.color === p ? " on" : "")} style={{ background: p }} onClick={() => upd(d.key, { color: p })} aria-label={p} />)}</span>
                  </div>
                  <p className="small muted">{plural(d.estudiantes.length, "estudiante", "estudiantes")} · índice {fmt(idx)} · {withCar === d.estudiantes.length ? "todos con carrera" : <span className="warn-txt">{d.estudiantes.length - withCar} sin carrera</span>} · {d.metrics.length} competencias</p>
                  <label className="replace-row">
                    <span className="muted small">Guardar como</span>
                    <select value={d.replaceId} onChange={(e) => upd(d.key, { replaceId: e.target.value })}>
                      <option value="">Clase nueva</option>
                      {snap.clases.map((c) => <option key={c.id} value={c.id}>Reemplazar datos de «{c.nombre}»</option>)}
                    </select>
                  </label>
                  {d.replaceId ? <p className="note small">Se sustituyen los estudiantes y valores de «{snap.clases.find((c) => c.id === d.replaceId)?.nombre}». Se conservan su nombre, color y quién tiene acceso.</p> : (
                  <div className="chips">
                    <span className="muted small">{D().one}:</span>
                    {decanos.map((p) => { const on = d.decanos.includes(p.id); return (
                      <button type="button" key={p.id} className={"pchip" + (on ? " on" : "")} onClick={() => upd(d.key, { decanos: on ? d.decanos.filter((x) => x !== p.id) : [...d.decanos, p.id] })}>
                        <Avatar name={p.nombre} size={20} /><span>{p.nombre}</span>{on && <Icon name="check" size={13} />}</button>); })}
                    {!decanos.length && <span className="muted small">Aún no hay {low(D().many)} (puedes asignarla después).</span>}
                  </div>)}
                </div>
                <button className="icon-btn draft-x" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} aria-label="Descartar"><Icon name="close" /></button>
              </div>
            );
          })}
        </div>
      </>}

      {codes.length > 0 && (
        <div className="card pad">
          <h3>Nombres de carreras</h3>
          <p className="muted small">Los listados traen códigos (ej. ISO). Escribe un nombre legible para mostrarlo en toda la app.</p>
          <div className="carreras">
            {codes.map((c) => <label key={c} className="field inline"><code>{c}</code><input value={names[c] ?? ""} placeholder="Nombre visible" onChange={(e) => setNames({ ...names, [c]: e.target.value })} /></label>)}
          </div>
          <button className="btn" onClick={() => run((a) => a.upsertCarreras(codes.map((c) => ({ codigo: c, nombre: names[c] ?? "" }))), "Carreras guardadas")}>Guardar nombres</button>
        </div>
      )}
    </>
  );
}
