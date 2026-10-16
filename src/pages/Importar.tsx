/* Importar: un solo lugar para soltar CUALQUIER Excel.
   - Listados de estudiantes (ADM535, lista del juego, recopilaciones propias): se reconocen las
     columnas, se unen al directorio y se pueden deshacer o reajustar.
   - Informes del juego: cada estudiante se enlaza con el directorio (seguro → solo; dudoso → se pregunta).
   - Directorio: tabla editable, completar en bloque, descargar lo incompleto y aplicar a clases ya cargadas. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { Avatar, Icon, Segmented } from "../components/ui";
import { Radar } from "../components/Radar";
import { Ring } from "../components/Charts";
import { guessGroup, parseReport, readSheet } from "../lib/parse";
import { generalIndex, mean, fmt, normText, plural, displayName } from "../lib/metrics";
import { downloadDirectory, downloadReportTemplate, downloadRosterTemplate } from "../lib/templates";
import { Directory, FIELD_LABEL, completeness, detectFile, extractPeople, mergePeople, syncPatches, type Field, type Found, type MergeResult } from "../lib/directory";
import type { ClaseDraft, RosterEntry } from "../lib/types";
import { PALETTE } from "../data/demoSeed";
import { PageHead } from "./Dashboard";
import { D, low } from "../lib/labels";
import { friendlyError } from "../data/api";

type Est = ClaseDraft["estudiantes"][number];
/** Enlace de un estudiante del informe con el directorio */
interface Link { found: Found; choice: RosterEntry | "nuevo" | null; }
interface Draft extends Omit<ClaseDraft, "estudiantes"> { key: string; replaceId: string; raw: Est[]; links: Link[]; }
interface ListJob { key: string; fileName: string; rows: unknown[][]; header: number; mapping: Field[]; before: RosterEntry[]; result: MergeResult; archivoManda: boolean; }

const autoChoice = (f: Found): Link["choice"] => (f.e && (f.seguro || f.how !== "nombre") ? f.e : null);
function linkAll(raw: Est[], list: RosterEntry[], prev?: Link[]): Link[] {
  const dir = new Directory(list);
  return raw.map((s, i) => {
    const found = dir.find({ nombre: s.nombre, matricula: s.matricula, equipo: s.equipo, grupo: s.grupo });
    const old = prev?.[i]?.choice;
    // conserva lo que el usuario ya eligió a mano, si sigue existiendo
    const choice = old === "nuevo" ? "nuevo" : old && list.includes(old) ? old : autoChoice(found);
    return { found, choice };
  });
}
/** Estudiante del informe completado con los datos de su persona del directorio */
function enrich(s: Est, l: Link): Est {
  const e = l.choice && l.choice !== "nuevo" ? l.choice : null;
  if (!e) return s;
  return { ...s, matricula: s.matricula || e.matricula, carrera: s.carrera || e.carrera, grupo: s.grupo || e.grupo, equipo: s.equipo || e.equipo || "" };
}

export default function Importar() {
  const { api, snap, toast, refresh } = useApp();
  const [tab, setTab] = usePref<"importar" | "directorio">("importTab", "importar");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [jobs, setJobs] = useState<ListJob[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => { api.loadRoster().then((r) => { setRoster(r); setLoaded(true); }).catch(() => setLoaded(true)); }, [api]);

  /** Guarda el directorio y vuelve a enlazar los informes pendientes */
  const persist = async (list: RosterEntry[], ok?: string) => {
    setRoster(list);
    setDrafts((ds) => ds.map((d) => ({ ...d, links: linkAll(d.raw, list, d.links) })));
    try { await api.saveRoster(list); if (ok) toast(ok); } catch (e) { toast(friendlyError(e), "error"); }
  };

  return (
    <>
      <PageHead title="Importar" sub="Suelta cualquier Excel: listados de estudiantes de cualquier origen o informes del juego. Todo se lee en tu navegador y se une solo." />
      {api.directoryLimited && (
        <div className="banner warn"><Icon name="alert" size={18} /><span>La base de datos aún no tiene el directorio completo (correo, equipo, licencia). Ejecuta <code>supabase/migrations/003_directorio.sql</code> en el SQL Editor de Supabase.</span></div>
      )}
      <div className="toolbar">
        <Segmented value={tab} onChange={setTab} options={[{ value: "importar", label: "Importar archivos" }, { value: "directorio", label: `Directorio${loaded ? ` (${roster.length})` : ""}` }]} />
      </div>
      {tab === "importar"
        ? <ImportTab roster={roster} persist={persist} jobs={jobs} setJobs={setJobs} drafts={drafts} setDrafts={setDrafts} goDir={() => setTab("directorio")} />
        : <DirectoryTab roster={roster} persist={persist} refresh={refresh} snap={snap} />}
    </>
  );
}

/* =====================================================================
   Pestaña 1 · Importar archivos
   ===================================================================== */
function ImportTab({ roster, persist, jobs, setJobs, drafts, setDrafts, goDir }: {
  roster: RosterEntry[]; persist(l: RosterEntry[], ok?: string): Promise<void>;
  jobs: ListJob[]; setJobs: React.Dispatch<React.SetStateAction<ListJob[]>>;
  drafts: Draft[]; setDrafts: React.Dispatch<React.SetStateAction<Draft[]>>; goDir(): void;
}) {
  const { api, snap, toast, refresh } = useApp();
  const go = useNavigate();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const comp = completeness(roster);

  const handle = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setBusy(`Leyendo ${plural(arr.length, "archivo", "archivos")}…`);
    const parsed: { file: File; rows: unknown[][] }[] = [];
    for (const file of arr) {
      try { parsed.push({ file, rows: await readSheet(file) }); }
      catch (e) { toast(`No pude leer "${file.name}": ${friendlyError(e)}`, "error"); }
    }
    // primero los listados (se unen al directorio), después los informes (ya encuentran a cada persona)
    let list = roster;
    const newJobs: ListJob[] = [];
    const reports: { file: File; rows: unknown[][] }[] = [];
    for (const p of parsed) {
      const k = detectFile(p.rows);
      if (k.kind === "informe") { reports.push(p); continue; }
      if (k.kind === "desconocido") {
        if (p.rows.some((r) => normText(r?.[0]) === "ESTUDIANTE")) reports.push(p);
        else toast(`"${p.file.name}": no reconocí las columnas. Usa la plantilla del directorio o un listado con encabezados (Nombre, Matrícula, Carrera…).`, "error");
        continue;
      }
      const people = extractPeople(p.rows, k.header, k.mapping);
      if (!people.length) { toast(`"${p.file.name}" no tiene estudiantes.`, "error"); continue; }
      const result = mergePeople(list, people);
      newJobs.push({ key: p.file.name + Date.now(), fileName: p.file.name, rows: p.rows, header: k.header, mapping: k.mapping, before: list, result, archivoManda: false });
      list = result.list;
    }
    if (newJobs.length) {
      setJobs((j) => [...j, ...newJobs]);
      const t = newJobs.reduce((a, j) => ({ n: a.n + j.result.nuevos, c: a.c + j.result.completados }), { n: 0, c: 0 });
      await persist(list, `Directorio: ${plural(t.n, "persona nueva", "personas nuevas")}, ${plural(t.c, "completada", "completadas")}`);
    }
    const nd: Draft[] = [];
    reports.forEach((p, i) => {
      const rep = parseReport(p.rows);
      if (!rep) { toast(`"${p.file.name}" no tiene estudiantes (las filas EJEMPLO se ignoran).`, "error"); return; }
      const nombre = p.file.name.replace(/\.(xlsx|xls|csv)$/i, "").replace(/^icompetencyreport-?/i, "Clase ").replace(/^plantilla-informe-competencias$/i, "Nueva clase");
      const same = snap.clases.find((c) => normText(c.nombre) === normText(nombre));
      const links = linkAll(rep.students, list);
      nd.push({ key: p.file.name + Date.now() + i, replaceId: same?.id ?? "", nombre, grupo: guessGroup(rep.students.map((s, j) => enrich(s, links[j]))),
        periodo: "", color: PALETTE[(snap.clases.length + drafts.length + i) % PALETTE.length], metrics: rep.metrics, archivo: p.file.name,
        raw: rep.students, links, decanos: [] });
    });
    setDrafts((ds) => [...ds, ...nd]);
    setBusy(null);
  };

  /* --- listados: reajustar columnas, dar prioridad al archivo, deshacer --- */
  const redo = async (job: ListJob, patch: Partial<Pick<ListJob, "mapping" | "archivoManda">>) => {
    const j = { ...job, ...patch };
    j.result = mergePeople(j.before, extractPeople(j.rows, j.header, j.mapping), j.archivoManda);
    setJobs((js) => js.map((x) => (x.key === job.key ? j : x)));
    await persist(j.result.list, "Directorio actualizado");
  };
  const undo = async (job: ListJob) => {
    setJobs((js) => js.filter((x) => x.key !== job.key));
    await persist(job.before, `Se deshizo "${job.fileName}"`);
  };

  /* --- informes: guardar clases (y agregar al directorio a quien se marcó como nuevo) --- */
  const upd = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const save = async () => {
    setBusy("Guardando clases…");
    let ok = 0;
    const nuevos: RosterEntry[] = [];
    for (const d of drafts) {
      const estudiantes = d.raw.map((s, i) => enrich(s, d.links[i]));
      d.raw.forEach((s, i) => { if (d.links[i].choice === "nuevo") nuevos.push({ nombre: s.nombre, matricula: s.matricula, carrera: s.carrera, grupo: s.grupo || d.grupo, equipo: s.equipo || "" }); });
      try {
        if (d.replaceId) await api.replaceResultados(d.replaceId, { metrics: d.metrics, estudiantes, archivo: d.archivo });
        else await api.importClase({ nombre: d.nombre.trim() || d.archivo, grupo: d.grupo, periodo: d.periodo, color: d.color, metrics: d.metrics, archivo: d.archivo, estudiantes, decanos: d.decanos });
        ok++;
        setDrafts((ds) => ds.filter((x) => x.key !== d.key));
      } catch (e) { toast(`${d.nombre}: ${friendlyError(e)}`, "error"); }
    }
    if (nuevos.length) await persist(mergePeople(roster, nuevos).list);
    await refresh();
    setBusy(null);
    if (ok) { toast(`${plural(ok, "clase guardada", "clases guardadas")}${nuevos.length ? ` · ${plural(nuevos.length, "persona agregada", "personas agregadas")} al directorio` : ""}`); go("/clases"); }
  };

  return (
    <>
      <div className={"drop card" + (drag ? " over" : "") + (busy ? " busy" : "")} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}>
        <div className="drop-ico">{busy ? <span className="spinner lg" /> : <Icon name="upload" size={30} />}</div>
        <h3>{busy ?? "Suelta aquí uno o varios archivos"}</h3>
        <p className="muted">Informes del juego (<code>icompetencyreport…</code>) y listados de estudiantes de cualquier origen: ADM535, la lista del juego (<i>License number, Team, First name…</i>) o la tuya. La app reconoce cada columna sola.</p>
        <div className="drop-kinds"><span><Icon name="students" size={14} /> Listados → directorio</span><span><Icon name="compare" size={14} /> Informes → clases</span><span><Icon name="key" size={14} /> Contraseñas: se ignoran</span></div>
        <input ref={input} type="file" hidden multiple accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="grid2">
        <button type="button" className="card pad dir-sum" onClick={goDir}>
          <Ring value={roster.length ? comp.pct : null} size={58} stroke={6} />
          <span className="rank-txt"><b>Directorio de estudiantes</b>
            <small>{roster.length ? `${roster.length} personas · ${comp.sinCarrera} sin carrera · ${comp.sinMatricula} sin matrícula` : "Vacío. Sube un listado para empezar (opcional)."}</small></span>
          <Icon name="chevron" size={16} />
        </button>
        <section className="card pad templates">
          <h3><Icon name="download" size={18} /> Plantillas</h3>
          <div className="tpl-row">
            <button className="tpl sm" onClick={() => downloadReportTemplate()}><span className="tpl-ico">XLS</span><b>Informe</b></button>
            <button className="tpl sm" onClick={() => downloadRosterTemplate()}><span className="tpl-ico">XLS</span><b>Directorio</b></button>
            <button className="tpl sm" onClick={() => go("/equipo?importar=1")}><span className="tpl-ico alt">XLS</span><b>Cuentas</b></button>
          </div>
        </section>
      </div>

      {jobs.map((j, idx) => <ListCard key={j.key} job={j} last={idx === jobs.length - 1} onRedo={(p) => redo(j, p)} onUndo={() => undo(j)} onClose={() => setJobs((js) => js.filter((x) => x.key !== j.key))} />)}

      {drafts.length > 0 && <>
        <div className="section-h"><h2>{plural(drafts.length, "clase lista", "clases listas")} para guardar</h2>
          <button className="btn primary" disabled={!!busy} onClick={save}><Icon name="check" size={16} /> Guardar {drafts.length > 1 ? "todas" : ""}</button></div>
        <div className="drafts">
          {drafts.map((d) => <DraftCard key={d.key} d={d} roster={roster} upd={(p) => upd(d.key, p)} onDiscard={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} />)}
        </div>
      </>}
    </>
  );
}

/* ---------- Tarjeta de un listado ya unido al directorio ---------- */
function ListCard({ job, last, onRedo, onUndo, onClose }: { job: ListJob; last: boolean; onRedo(p: Partial<ListJob>): void; onUndo(): void; onClose(): void }) {
  const [open, setOpen] = useState(false);
  const head = (job.rows[job.header] ?? []).map((v) => String(v ?? "").trim());
  const sample = (c: number) => job.rows.slice(job.header + 1, job.header + 4).map((r) => String(r?.[c] ?? "")).filter(Boolean).join(" · ");
  const r = job.result;
  const used = job.mapping.map((f, c) => ({ f, c, h: head[c] })).filter((x) => x.h || x.f !== "ignorar");
  return (
    <section className="card pad listcard">
      <div className="card-h">
        <div className="rank-txt"><b><Icon name="students" size={16} /> {job.fileName}</b><small>Listado unido al directorio</small></div>
        <div className="row-gap">
          {last && <button className="btn sm" onClick={onUndo}>Deshacer</button>}
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
      </div>
      <div className="merge-stats">
        <span className="ms good"><b>{r.nuevos}</b> nuevas</span>
        <span className="ms info"><b>{r.completados}</b> completadas</span>
        <span className="ms"><b>{r.iguales}</b> sin cambios</span>
        {r.conflictos.length > 0 && <span className="ms warn"><b>{r.conflictos.length}</b> diferencias</span>}
      </div>
      <div className="chips">
        {used.map(({ f, c, h }) => (
          <span key={c} className={"colchip " + (f === "privado" ? "priv" : f === "ignorar" ? "off" : "on")} title={sample(c)}>
            <small>{h || `Columna ${c + 1}`}</small>{f === "privado" ? <><Icon name="key" size={12} /> se ignora</> : f === "ignorar" ? "no se usa" : FIELD_LABEL[f]}
          </span>
        ))}
      </div>
      {r.conflictos.length > 0 && (
        <div className="conflicts">
          <p className="small"><b>Datos distintos a los que ya había.</b> {job.archivoManda ? "Se usaron los de este archivo." : "Se conservaron los del directorio."}</p>
          <div className="chips">{Object.entries(r.conflictos.reduce<Record<string, number>>((a, c) => { a[c.campo] = (a[c.campo] ?? 0) + 1; return a; }, {}))
            .map(([k, n]) => <span key={k} className="ms warn"><b>{n}</b> con otro valor en {(FIELD_LABEL[k as Field] ?? k).toLowerCase()}</span>)}</div>
          <p className="muted tiny">Ejemplos:</p>
          <ul>{r.conflictos.slice(0, 5).map((c, i) => <li key={i}><span>{displayName(c.nombre)}</span><span className="muted">{FIELD_LABEL[c.campo as Field] ?? c.campo}: <s>{c.actual}</s> → {c.nuevo}</span></li>)}</ul>
          {r.conflictos.length > 5 && <p className="muted tiny">…y {r.conflictos.length - 5} más.</p>}
          <label className="switch-label"><input type="checkbox" className="switch" checked={job.archivoManda} onChange={(e) => onRedo({ archivoManda: e.target.checked })} /> Usar los datos de este archivo</label>
        </div>
      )}
      <button className="link small" onClick={() => setOpen(!open)}>{open ? "Ocultar columnas" : "¿Alguna columna mal reconocida? Ajústala"}</button>
      {open && (
        <div className="colmap">
          {head.map((h, c) => (
            <label key={c} className="colmap-row">
              <span><b>{h || `Columna ${c + 1}`}</b><small>{sample(c) || "—"}</small></span>
              <select value={job.mapping[c] ?? "ignorar"} onChange={(e) => { const m = [...job.mapping]; m[c] = e.target.value as Field; onRedo({ mapping: m }); }}>
                {(Object.keys(FIELD_LABEL) as Field[]).map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Tarjeta de un informe del juego, con su enlace al directorio ---------- */
function DraftCard({ d, roster, upd, onDiscard }: { d: Draft; roster: RosterEntry[]; upd(p: Partial<Draft>): void; onDiscard(): void }) {
  const { snap } = useApp();
  const [review, setReview] = useState(false);
  const decanos = snap.profiles.filter((p) => p.rol === "decano" && p.activo);
  const est = d.raw.map((s, i) => enrich(s, d.links[i]));
  const ok = d.links.filter((l) => l.choice && l.choice !== "nuevo").length;
  const nuevos = d.links.filter((l) => l.choice === "nuevo").length;
  const dudosos = d.links.filter((l) => !l.choice && l.found.candidatos.length).length;
  const sinMatch = d.links.filter((l) => !l.choice && !l.found.candidatos.length).length;
  const withCar = est.filter((s) => s.carrera).length;
  const idx = mean(est.map((s) => generalIndex(d.metrics, s.valores)));
  const vec = d.metrics.map((_, i) => mean(est.map((s) => s.valores[i])));
  const equipos = new Set(est.map((s) => s.equipo).filter(Boolean)).size;
  const setChoice = (i: number, choice: Link["choice"]) => upd({ links: d.links.map((l, j) => (j === i ? { ...l, choice } : l)) });
  const allNew = () => upd({ links: d.links.map((l) => (!l.choice && !l.found.candidatos.length ? { ...l, choice: "nuevo" } : l)) });

  return (
    <div className="card draft" style={{ ["--c" as string]: d.color }}>
      <div className="draft-radar"><Radar compact size={130} labels={d.metrics} series={[{ name: d.nombre, color: d.color, values: vec as number[] }]} /></div>
      <div className="draft-body">
        <input className="title-input" value={d.nombre} onChange={(e) => upd({ nombre: e.target.value })} aria-label="Nombre de la clase" />
        <div className="draft-meta">
          <label>Grupo <input value={d.grupo} onChange={(e) => upd({ grupo: e.target.value })} /></label>
          <label>Periodo <input value={d.periodo} placeholder="2026-2" onChange={(e) => upd({ periodo: e.target.value })} /></label>
          <span className="swatches sm">{PALETTE.slice(0, 8).map((p) => <button type="button" key={p} className={"swatch" + (d.color === p ? " on" : "")} style={{ background: p }} onClick={() => upd({ color: p })} aria-label={p} />)}</span>
        </div>
        <p className="small muted">{plural(est.length, "estudiante", "estudiantes")} · índice {fmt(idx)}{equipos ? ` · ${plural(equipos, "equipo", "equipos")} del juego` : ""} · {withCar === est.length ? "todos con carrera" : <span className="warn-txt">{est.length - withCar} sin carrera</span>}</p>

        <div className="link-sum">
          <span className="ms good" title="Encontrados en el directorio"><Icon name="check" size={13} /> <b>{ok}</b> enlazados</span>
          {dudosos > 0 && <button className="ms warn" onClick={() => setReview(true)}><b>{dudosos}</b> por confirmar</button>}
          {sinMatch > 0 && <button className="ms" onClick={() => setReview(true)}><b>{sinMatch}</b> sin coincidencia</button>}
          {nuevos > 0 && <span className="ms info"><b>{nuevos}</b> se agregarán al directorio</span>}
          {d.raw.length > 0 && <button className="link small" onClick={() => setReview(!review)}>{review ? "Ocultar" : "Revisar enlaces"}</button>}
        </div>
        {!roster.length && <p className="muted tiny">Sin directorio todavía: la clase se guarda igual; puedes completar carrera y matrícula después.</p>}

        {review && (
          <div className="links">
            {sinMatch > 0 && <button className="btn sm" onClick={allNew}><Icon name="plus" size={14} /> Agregar los {sinMatch} sin coincidencia al directorio</button>}
            {d.raw.map((s, i) => {
              const l = d.links[i];
              const sure = l.choice && l.choice !== "nuevo" && (l.found.seguro || l.found.how !== "nombre");
              return (
                <div key={i} className={"link-row" + (!l.choice ? " pend" : "")}>
                  <span className="rank-txt"><b>{displayName(s.nombre)}</b><small>{s.equipo || "sin equipo"}{sure ? ` · por ${l.found.how}` : ""}</small></span>
                  <select value={l.choice === "nuevo" ? "__nuevo" : l.choice ? String(roster.indexOf(l.choice)) : ""}
                    onChange={(e) => setChoice(i, e.target.value === "__nuevo" ? "nuevo" : e.target.value === "" ? null : roster[+e.target.value])}>
                    <option value="">— Sin enlazar —</option>
                    {l.found.candidatos.map((c) => <option key={roster.indexOf(c)} value={roster.indexOf(c)}>{displayName(c.nombre)}{c.matricula ? ` · ${c.matricula}` : ""}{c.carrera ? ` · ${c.carrera}` : ""}</option>)}
                    {l.choice && l.choice !== "nuevo" && !l.found.candidatos.includes(l.choice) && <option value={roster.indexOf(l.choice)}>{displayName(l.choice.nombre)}</option>}
                    <option value="__nuevo">+ Agregar como persona nueva</option>
                  </select>
                </div>
              );
            })}
          </div>
        )}

        <label className="replace-row">
          <span className="muted small">Guardar como</span>
          <select value={d.replaceId} onChange={(e) => upd({ replaceId: e.target.value })}>
            <option value="">Clase nueva</option>
            {snap.clases.map((c) => <option key={c.id} value={c.id}>Reemplazar datos de «{c.nombre}»</option>)}
          </select>
        </label>
        {d.replaceId ? <p className="note small">Se sustituyen los estudiantes y valores de «{snap.clases.find((c) => c.id === d.replaceId)?.nombre}». Se conservan su nombre, color y quién tiene acceso.</p> : (
          <div className="chips">
            <span className="muted small">{D().one}:</span>
            {decanos.map((p) => { const on = d.decanos.includes(p.id); return (
              <button type="button" key={p.id} className={"pchip" + (on ? " on" : "")} onClick={() => upd({ decanos: on ? d.decanos.filter((x) => x !== p.id) : [...d.decanos, p.id] })}>
                <Avatar name={p.nombre} size={20} /><span>{p.nombre}</span>{on && <Icon name="check" size={13} />}</button>); })}
            {!decanos.length && <span className="muted small">Aún no hay {low(D().many)} (puedes asignarla después).</span>}
          </div>)}
      </div>
      <button className="icon-btn draft-x" onClick={onDiscard} aria-label="Descartar"><Icon name="close" /></button>
    </div>
  );
}

/* =====================================================================
   Pestaña 2 · Directorio de estudiantes
   ===================================================================== */
const PAGE = 100;
function DirectoryTab({ roster, persist, refresh, snap }: { roster: RosterEntry[]; persist(l: RosterEntry[], ok?: string): Promise<void>; refresh(): Promise<void>; snap: ReturnType<typeof useApp>["snap"] }) {
  const { toast, run } = useApp();
  const [rows, setRows] = useState<RosterEntry[]>(roster);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "incompletos" | "carrera" | "matricula">("todos");
  const [sel, setSel] = useState<Set<RosterEntry>>(new Set());
  const [bulk, setBulk] = useState({ campo: "carrera" as "carrera" | "grupo" | "equipo", valor: "" });
  const [limit, setLimit] = useState(PAGE);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => { if (!dirty) setRows(roster); }, [roster, dirty]);
  useEffect(() => { setNames(Object.fromEntries(snap.carreras.map((c) => [c.codigo, c.nombre]))); }, [snap.carreras]);

  const comp = completeness(rows);
  const patches = useMemo(() => syncPatches(snap.resultados, roster), [snap.resultados, roster]);
  const n = normText(q);
  const list = rows.filter((e) =>
    (filtro === "todos" || (filtro === "incompletos" ? !e.carrera || !e.matricula : filtro === "carrera" ? !e.carrera : !e.matricula)) &&
    (!n || normText([e.nombre, e.matricula, e.carrera, e.grupo, e.equipo, e.email].join(" ")).includes(n)));
  const codes = [...new Set(rows.map((r) => r.carrera).filter((c) => c && c.length <= 6))].sort();

  const edit = (e: RosterEntry, k: keyof RosterEntry, v: string) => { setRows((rs) => rs.map((x) => (x === e ? { ...x, [k]: v } : x))); setDirty(true); };
  // al editar se crea un objeto nuevo: la selección se reubica por posición
  const toggle = (e: RosterEntry) => { const s = new Set(sel); if (s.has(e)) s.delete(e); else s.add(e); setSel(s); };
  const applyBulk = () => {
    if (!sel.size || !bulk.valor.trim()) return;
    setRows((rs) => rs.map((x) => (sel.has(x) ? { ...x, [bulk.campo]: bulk.valor.trim() } : x)));
    setSel(new Set()); setDirty(true);
  };
  const remove = () => { if (!confirm(`¿Quitar ${plural(sel.size, "persona", "personas")} del directorio?`)) return; setRows((rs) => rs.filter((x) => !sel.has(x))); setSel(new Set()); setDirty(true); };
  const addPerson = () => { setRows((rs) => [{ nombre: "", matricula: "", carrera: "", grupo: "", equipo: "", email: "", licencia: "" }, ...rs]); setDirty(true); setFiltro("todos"); setQ(""); };
  const save = async () => { await persist(rows.filter((r) => r.nombre.trim()), "Directorio guardado"); setDirty(false); };
  const sync = async () => {
    const r = await run((a) => a.syncResultados(patches));
    if (r !== false) toast(`${plural(r as number, "resultado actualizado", "resultados actualizados")} en las clases`);
    await refresh();
  };

  return (
    <>
      <div className="dir-head">
        <div className="card pad dir-stat">
          <Ring value={rows.length ? comp.pct : null} size={70} stroke={7} />
          <div><b className="big">{rows.length}</b> personas<br /><span className="muted small">{comp.pct}% completo</span></div>
          <div className="dir-gaps">
            <button className={"ms" + (filtro === "carrera" ? " sel" : "")} onClick={() => setFiltro(filtro === "carrera" ? "todos" : "carrera")}><b>{comp.sinCarrera}</b> sin carrera</button>
            <button className={"ms" + (filtro === "matricula" ? " sel" : "")} onClick={() => setFiltro(filtro === "matricula" ? "todos" : "matricula")}><b>{comp.sinMatricula}</b> sin matrícula</button>
            <span className="ms"><b>{comp.sinGrupo}</b> sin grupo</span>
          </div>
        </div>
        <div className="card pad dir-actions">
          <h4>Completar lo que falta</h4>
          <button className="btn" disabled={!rows.length} onClick={() => downloadDirectory(rows, true)}><Icon name="download" size={16} /> Descargar incompletos</button>
          <p className="muted tiny">Llénalos en Excel y súbelos en «Importar archivos»: se unen solos.</p>
          <button className="btn ghost sm" disabled={!rows.length} onClick={() => downloadDirectory(rows)}>Descargar todo el directorio</button>
        </div>
        <div className={"card pad dir-actions" + (patches.length ? " glow" : "")}>
          <h4>Clases ya cargadas</h4>
          {patches.length
            ? <><p className="small">El directorio puede completar <b>{plural(patches.length, "estudiante", "estudiantes")}</b> de tus clases (matrícula, carrera, grupo o equipo).</p>
                <button className="btn primary" onClick={sync}><Icon name="bolt" size={16} /> Aplicar a las clases</button></>
            : <p className="muted small">Todo al día: no hay datos nuevos para tus clases.</p>}
        </div>
      </div>

      <div className="toolbar">
        <label className="search grow"><Icon name="search" size={16} /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Buscar por nombre, matrícula, carrera, equipo o correo" /></label>
        <Segmented size="sm" value={filtro} onChange={setFiltro} options={[{ value: "todos", label: "Todos" }, { value: "incompletos", label: "Incompletos" }]} />
        <button className="btn" onClick={addPerson}><Icon name="plus" size={16} /> Persona</button>
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{plural(sel.size, "seleccionada", "seleccionadas")}</b>
          <select value={bulk.campo} onChange={(e) => setBulk({ ...bulk, campo: e.target.value as typeof bulk.campo })}>
            <option value="carrera">Asignar carrera</option><option value="grupo">Asignar grupo</option><option value="equipo">Asignar equipo</option>
          </select>
          <input list="dir-codes" value={bulk.valor} onChange={(e) => setBulk({ ...bulk, valor: e.target.value })} placeholder="Valor" />
          <datalist id="dir-codes">{codes.map((c) => <option key={c} value={c}>{names[c]}</option>)}</datalist>
          <button className="btn primary sm" onClick={applyBulk}>Aplicar</button>
          <span className="grow" />
          <button className="btn danger sm" onClick={remove}><Icon name="trash" size={14} /> Quitar</button>
          <button className="link small" onClick={() => setSel(new Set())}>Cancelar</button>
        </div>
      )}

      {!rows.length ? (
        <div className="card pad"><p className="muted">El directorio está vacío. Sube un listado en «Importar archivos» o usa la plantilla del directorio. Es opcional: sirve para completar carrera, matrícula y grupo de los informes del juego.</p></div>
      ) : (
        <div className="card table-card">
          <div className="table-scroll">
            <table className="etable dirtable">
              <thead><tr>
                <th className="sticky"><input type="checkbox" checked={list.length > 0 && list.slice(0, limit).every((e) => sel.has(e))} onChange={(e) => setSel(e.target.checked ? new Set(list.slice(0, limit)) : new Set())} aria-label="Seleccionar todos" /></th>
                <th>Nombre</th><th>Matrícula</th><th>Carrera</th><th>Grupo</th><th>Equipo del juego</th><th>Correo</th>
              </tr></thead>
              <tbody>
                {list.slice(0, limit).map((e, i) => (
                  <tr key={i + e.nombre} className={sel.has(e) ? "selrow" : ""}>
                    <td className="sticky"><input type="checkbox" checked={sel.has(e)} onChange={() => toggle(e)} /></td>
                    {(["nombre", "matricula", "carrera", "grupo", "equipo", "email"] as const).map((k) => (
                      <td key={k}><input className={"cell" + (!e[k] && (k === "carrera" || k === "matricula") ? " empty" : "")} value={e[k] ?? ""} list={k === "carrera" ? "dir-codes" : undefined}
                        placeholder={k === "carrera" || k === "matricula" ? "falta" : ""} onChange={(ev) => edit(e, k, ev.target.value)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.length && <p className="muted pad-x">Nadie coincide con el filtro.</p>}
          {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit(limit + PAGE)}>Mostrar {Math.min(PAGE, list.length - limit)} más</button></div>}
        </div>
      )}

      {dirty && (
        <div className="savebar">
          <span>Tienes cambios sin guardar en el directorio.</span>
          <button className="btn sm" onClick={() => { setRows(roster); setDirty(false); }}>Descartar</button>
          <button className="btn primary sm" onClick={save}>Guardar cambios</button>
        </div>
      )}

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
