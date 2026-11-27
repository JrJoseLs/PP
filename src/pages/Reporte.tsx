/* Reporte ejecutivo (administración y, si se permite, coordinadores; nunca docentes).
   Elige asignatura, período y clases; el reporte se arma solo, en hojas A4, con textos redactados
   a partir de los datos. Cualquier texto se puede corregir con un clic antes de descargar el PDF. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "../data/store";
import { Icon } from "../components/ui";
import { Radar } from "../components/Radar";
import { avgVector, displayName, fmt, plural, sparseMetrics } from "../lib/metrics";
import { metricName } from "../lib/labels";
import { fmtMin } from "../lib/game";
import { asignaturaDe, construirReporte, redactar, ult, type JuegoResumen } from "../lib/reporte";
import { puedeVerReporte } from "../lib/permisos";

const LS = "pp_reporte_cfg";
type Seccion = "grupos" | "competencias" | "carreras" | "simulacion" | "apoyo" | "cierre";
const SECCIONES: [Seccion, string][] = [["grupos", "Comparativa de grupos"], ["competencias", "Competencias"], ["carreras", "Carreras"], ["simulacion", "Simulación"], ["apoyo", "Estudiantes que necesitan apoyo"], ["cierre", "Conclusiones y recomendaciones"]];


export default function Reporte() {
  const { snap, user, rowsByClase, juegoByClase, metrics, api, refresh, toast } = useApp();
  const guardado = (() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } })();
  const [asig, setAsig] = useState<string>(guardado.asig ?? "");
  const [periodo, setPeriodo] = useState<string>("");
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [inst, setInst] = useState<string>(guardado.inst ?? "");
  const [nombres, setNombres] = useState(false);
  const [secs, setSecs] = useState<Set<Seccion>>(new Set(SECCIONES.map(([k]) => k)));
  const [verClases, setVerClases] = useState(false);
  const [editados, setEditados] = useState<Record<string, string>>({});

  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ asig, inst })); } catch { /* */ } }, [asig, inst]);
  // al imprimir solo sale el documento
  useEffect(() => { document.body.dataset.print = "reporte"; return () => { delete document.body.dataset.print; }; }, []);

  const asignaturas = useMemo(() => [...new Set(snap.clases.map((c) => asignaturaDe(c.nombre)).filter((x): x is string => !!x))].sort(), [snap.clases]);
  const periodos = useMemo(() => [...new Set(snap.clases.map((c) => c.periodo).filter(Boolean))].sort().reverse(), [snap.clases]);
  const candidatas = snap.clases.filter((c) => (!asig || asignaturaDe(c.nombre) === asig) && (!periodo || c.periodo === periodo));
  const clases = candidatas.filter((c) => !excluidas.has(c.id));

  const juegos = useMemo(() => new Map([...juegoByClase].map(([k, j]) => [k, { completos: j.completos, jugadores: j.jugadores, equiposOk: j.equiposOk, meta: j.meta } as JuegoResumen])), [juegoByClase]);
  const rep = useMemo(() => construirReporte(clases, rowsByClase, juegos, metrics), [clases, rowsByClase, juegos, metrics]);
  const alcance = [asig ? `la asignatura ${asig}` : "las clases seleccionadas", periodo ? `del período ${periodo}` : ""].filter(Boolean).join(" ");
  const txt = useMemo(() => redactar(rep, alcance), [rep, alcance]);
  const titulo = `Reporte ejecutivo${asig ? ` · ${asig}` : ""}${periodo ? ` · ${periodo}` : ""}`;
  const fecha = new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });

  if (!user || !puedeVerReporte(user.rol, snap.ajustes)) return <Navigate to="/" replace />;

  // texto editable: un clic y se corrige; el cambio se conserva mientras no se restablezca
  const E = ({ id, children, as = "p" }: { id: string; children: string; as?: "p" | "li" | "h1" | "span" }) => {
    const Tag = as;
    return <Tag className="rp-edit" contentEditable suppressContentEditableWarning title="Clic para editar"
      onBlur={(e) => { const t = (e.currentTarget as HTMLElement).innerText.trim(); if (t !== children) setEditados((x) => ({ ...x, [id]: t })); }}>{editados[id] ?? children}</Tag>;
  };
  const S = (k: Seccion) => secs.has(k);
  const labels = metrics.filter((m) => !sparseMetrics(clases.flatMap((c) => rowsByClase.get(c.id) ?? []), metrics).has(m));
  const pick = (v: (number | null)[]) => labels.map((m) => v[metrics.indexOf(m)]) as number[];
  const todas = clases.flatMap((c) => rowsByClase.get(c.id) ?? []);
  const g0 = rep.grupos[0], gN = ult(rep.grupos);
  const maxCrr = Math.max(1, ...rep.grupos.map((g) => g.crr ?? 0));

  const copiar = async () => {
    const t = [titulo, inst, "", editados.resumen ?? txt.resumen, "", "Hallazgos:", ...txt.hallazgos.map((h, i) => `• ${editados["h" + i] ?? h}`), "", "Recomendaciones:", ...txt.recomendaciones.map((h, i) => `• ${editados["r" + i] ?? h}`)].filter((x) => x !== undefined).join("\n");
    try { await navigator.clipboard.writeText(t); toast("Resumen copiado: pégalo en un correo"); } catch { toast("No se pudo copiar", "error"); }
  };
  const excel = async () => {
    const X = await import("xlsx");
    const filas = [["Grupo", "Estudiantes", "CRR", "Índice general", "Nivel alto", "Nivel medio", "Necesitan apoyo", "Completaron la simulación", "Participantes", "Scorecard acumulado", "Tiempo promedio [min]", "Competencia más fuerte", "Competencia a reforzar"],
      ...rep.grupos.map((g) => [g.clase.nombre, g.n, g.crr && Math.round(g.crr * 10) / 10, g.general && Math.round(g.general * 10) / 10, g.alto, g.medio, g.bajo, g.completos, g.jugadores, g.scorecard && Math.round(g.scorecard * 10) / 10, g.tiempo && Math.round(g.tiempo), g.fuerte ? metricName(g.fuerte) : "", g.debil ? metricName(g.debil) : ""])];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(filas), "Grupos");
    X.writeFile(wb, `${titulo.replace(/[\\/:*?"<>|·]+/g, " ").replace(/\s+/g, " ").trim()}.xlsx`);
  };

  return (
    <div className="rp-root">
      <aside className="rp-panel no-print">
        <h2><Icon name="report" size={20} /> Reporte ejecutivo</h2>
        <p className="muted small">Se arma solo con los datos. Haz clic en cualquier texto del reporte para corregirlo antes de descargarlo.</p>
        <label className="rp-f"><span>Asignatura</span>
          <select value={asig} onChange={(e) => { setAsig(e.target.value); setExcluidas(new Set()); }}>
            <option value="">Todas</option>{asignaturas.map((a) => <option key={a}>{a}</option>)}
          </select></label>
        {periodos.length > 0 && <label className="rp-f"><span>Período</span>
          <select value={periodo} onChange={(e) => { setPeriodo(e.target.value); setExcluidas(new Set()); }}>
            <option value="">Todos</option>{periodos.map((p) => <option key={p}>{p}</option>)}
          </select></label>}
        <div className="rp-f"><span>Clases</span>
          <button type="button" className="btn ghost sm" onClick={() => setVerClases(!verClases)}>{clases.length} de {candidatas.length} <Icon name="chevron" size={12} /></button>
          {verClases && <div className="rp-clases">
            {candidatas.map((c) => <label key={c.id}><input type="checkbox" checked={!excluidas.has(c.id)} onChange={() => { const s = new Set(excluidas); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); setExcluidas(s); }} /> {c.nombre}</label>)}
          </div>}</div>
        <label className="rp-f"><span>Institución</span><input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="Nombre de la universidad" /></label>
        <div className="rp-f"><span>Secciones</span>
          {SECCIONES.map(([k, t]) => <label key={k} className="rp-chk"><input type="checkbox" checked={S(k)} onChange={() => { const s = new Set(secs); if (s.has(k)) s.delete(k); else s.add(k); setSecs(s); }} /> {t}</label>)}
          <label className="rp-chk"><input type="checkbox" checked={nombres} onChange={(e) => setNombres(e.target.checked)} /> Incluir nombres de estudiantes con apoyo</label>
        </div>
        <div className="rp-acts">
          <button className="btn primary" disabled={!clases.length} onClick={() => window.print()}><Icon name="download" size={16} /> Descargar PDF</button>
          <button className="btn" disabled={!clases.length} onClick={copiar}>Copiar resumen para correo</button>
          <button className="btn ghost" disabled={!clases.length} onClick={excel}>Datos en Excel</button>
          {Object.keys(editados).length > 0 && <button className="btn ghost sm" onClick={() => setEditados({})}>Restablecer textos</button>}
        </div>
        {user.rol === "admin" && (
          <label className="rp-chk rp-perm"><input type="checkbox" checked={(snap.ajustes.reporteCoordinadores ?? true) !== false}
            onChange={async (e) => { try { await api.setAjuste("reporteCoordinadores", e.target.checked); await refresh(); } catch (er) { toast((er as Error).message, "error"); } }} />
            Los coordinadores pueden generar este reporte (con sus clases). Los docentes no tienen acceso.</label>
        )}
      </aside>

      <div className="rp-doc">
        {!clases.length ? <div className="rp-page rp-vacio"><p>No hay clases con esos filtros.</p></div> : <>
          {/* Portada */}
          <section className="rp-page rp-portada">
            <div className="rp-banda" />
            <div className="rp-portada-c">
              <small className="rp-eyebrow">{inst || "Preparación profesional"}</small>
              <E id="titulo" as="h1">{titulo}</E>
              <p className="rp-sub">{plural(rep.grupos.length, "grupo", "grupos")} · {plural(rep.estudiantes, "estudiante", "estudiantes")}{periodo ? ` · período ${periodo}` : ""}</p>
              <div className="rp-kpis">
                <Kpi label="CRR promedio" v={fmt(rep.crr)} sub={`nivel ${rep.crr === null ? "—" : rep.crr >= 66 ? "alto" : rep.crr >= 34 ? "medio" : "bajo"}`} />
                <Kpi label="Nivel alto" v={`${Math.round((rep.niveles.alto / Math.max(1, rep.estudiantes)) * 100)} %`} sub={plural(rep.niveles.alto, "estudiante", "estudiantes")} tone="good" />
                <Kpi label="Necesitan apoyo" v={String(rep.niveles.bajo)} sub="CRR menor de 34" tone="bad" />
                {rep.sim.conJuego > 0 && <Kpi label="Completaron la simulación" v={`${Math.round((rep.sim.completos / Math.max(1, rep.sim.jugadores)) * 100)} %`} sub={`Scorecard ${fmt(rep.sim.scorecard)}`} />}
              </div>
              <p className="rp-meta">Preparado por {user.nombre} · {fecha}</p>
            </div>
          </section>

          {/* Resumen ejecutivo */}
          <section className="rp-page">
            <Cab n={1} t="Resumen ejecutivo" />
            <E id="resumen">{txt.resumen}</E>
            <h3 className="rp-h3">Hallazgos principales</h3>
            <ul className="rp-list">{txt.hallazgos.map((h, i) => <E key={i} id={"h" + i} as="li">{h}</E>)}</ul>
            <div className="rp-niveles">
              <span>Distribución por nivel de CRR</span>
              <div className="rp-barra">{(["bajo", "medio", "alto"] as const).map((k) => rep.niveles[k] > 0 && <i key={k} className={k} style={{ flex: rep.niveles[k] }}>{Math.round((rep.niveles[k] / Math.max(1, rep.estudiantes)) * 100)} %</i>)}</div>
              <small>Bajo &lt; 34 · Medio 34–66 · Alto ≥ 66</small>
            </div>
          </section>

          {S("grupos") && <section className="rp-page">
            <Cab n={2} t="Comparativa de grupos" />
            <p className="rp-lead">Ordenados por CRR. La barra muestra el CRR; a la derecha, la participación en la simulación y su Scorecard.</p>
            <table className="rp-tabla">
              <thead><tr><th>#</th><th>Grupo</th><th className="num">Est.</th><th>CRR</th><th className="num">Apoyo</th>{rep.sim.conJuego > 0 && <><th className="num">Simulación</th><th className="num">Scorecard</th></>}</tr></thead>
              <tbody>{rep.grupos.map((g, i) => (
                <tr key={g.clase.id} className={g === g0 ? "top" : g === gN && rep.grupos.length > 2 ? "bottom" : ""}>
                  <td>{i + 1}</td><td><span className="dot" style={{ background: g.clase.color }} /> {g.clase.nombre}</td><td className="num">{g.n}</td>
                  <td><span className="rp-bar"><i style={{ width: ((g.crr ?? 0) / maxCrr) * 100 + "%" }} /><b>{fmt(g.crr)}</b></span></td>
                  <td className="num">{g.bajo || "—"}</td>
                  {rep.sim.conJuego > 0 && <><td className="num">{g.jugadores ? `${Math.round((g.completos / g.jugadores) * 100)} %` : "—"}</td><td className="num">{fmt(g.scorecard)}</td></>}
                </tr>))}</tbody>
            </table>
          </section>}

          {S("competencias") && labels.length >= 3 && <section className="rp-page">
            <Cab n={3} t="Perfil de competencias" />
            <div className="rp-radar">
              <Radar compact={false} size={470} labels={labels} invert series={[
                { name: "Promedio del conjunto", color: "#0a84ff", values: pick(avgVector(todas, metrics)), index: rep.crr },
                ...(g0 && gN && g0 !== gN ? [{ name: `Mejor: ${g0.clase.nombre}`, color: "#30d158", values: pick(avgVector(rowsByClase.get(g0.clase.id) ?? [], metrics)), dash: true, index: g0.crr },
                  { name: `Menor: ${gN.clase.nombre}`, color: "#ff9f0a", values: pick(avgVector(rowsByClase.get(gN.clase.id) ?? [], metrics)), dash: true, index: gN.crr }] : []),
              ]} />
            </div>
            <div className="rp-cols">
              <div><h3 className="rp-h3 good">Fortalezas</h3><ol className="rp-rank">{rep.fuertes.map((x) => <li key={x.m}>{metricName(x.m)} <b>{fmt(x.v)}</b></li>)}</ol></div>
              <div><h3 className="rp-h3 bad">A reforzar</h3><ol className="rp-rank">{rep.debiles.map((x) => <li key={x.m}>{metricName(x.m)} <b>{fmt(x.v)}</b></li>)}</ol></div>
            </div>
            {rep.diferencias.length > 0 && <>
              <h3 className="rp-h3">Dónde se diferencian los grupos</h3>
              <table className="rp-tabla compacta"><tbody>{rep.diferencias.map((d) => (
                <tr key={d.m}><td>{metricName(d.m)}</td><td className="muted">{d.min.g} <b>{fmt(d.min.v)}</b></td><td className="muted">{d.max.g} <b>{fmt(d.max.v)}</b></td><td className="num"><b>{fmt(d.rango)}</b> pts</td></tr>))}</tbody></table>
            </>}
          </section>}

          {(S("carreras") || S("simulacion")) && <section className="rp-page">
            {S("carreras") && <>
              <Cab n={4} t="Carreras" />
              <table className="rp-tabla"><thead><tr><th>Carrera</th><th className="num">Estudiantes</th><th className="num">CRR</th><th>Competencia más fuerte</th></tr></thead>
                <tbody>{rep.carreras.slice(0, 14).map((c) => <tr key={c.carrera}><td>{c.carrera}</td><td className="num">{c.n}</td><td className="num"><b>{fmt(c.crr)}</b></td><td>{c.fuerte ? metricName(c.fuerte) : "—"}</td></tr>)}</tbody></table>
              {rep.carreras.length > 14 && <p className="rp-nota">y {plural(rep.carreras.length - 14, "carrera más", "carreras más")} con pocos estudiantes.</p>}
            </>}
            {S("simulacion") && rep.sim.conJuego > 0 && <>
              <Cab n={5} t="Simulación" />
              <div className="rp-kpis chico">
                <Kpi label="Completaron" v={`${rep.sim.completos} de ${rep.sim.jugadores}`} sub={rep.sim.trimestre ? `llegaron al trimestre ${rep.sim.trimestre}` : ""} />
                <Kpi label="Scorecard acumulado" v={fmt(rep.sim.scorecard)} sub="promedio" />
                <Kpi label="Tiempo por estudiante" v={fmtMin(rep.sim.tiempo)} sub="solo quienes completaron" />
              </div>
              <p className="rp-nota">El tiempo es contexto: dedicar más horas no equivale por sí solo a mejor desempeño. El resultado lo mide el Scorecard.</p>
            </>}
          </section>}

          {S("apoyo") && <section className="rp-page">
            <Cab n={6} t="Estudiantes que necesitan apoyo" />
            {rep.apoyo.length ? <>
              <p className="rp-lead">{plural(rep.apoyo.length, "estudiante tiene", "estudiantes tienen")} un CRR menor de 34. Por grupo:</p>
              <div className="rp-chips">{rep.grupos.filter((g) => g.bajo).map((g) => <span key={g.clase.id}>{g.clase.nombre} <b>{g.bajo}</b></span>)}</div>
              {nombres && <table className="rp-tabla compacta"><thead><tr><th>Estudiante</th><th>Grupo</th><th>Carrera</th><th className="num">CRR</th></tr></thead>
                <tbody>{rep.apoyo.slice(0, 40).map((r) => <tr key={r.r.id}><td>{displayName(r.r.nombre)}</td><td>{r.cls.nombre}</td><td>{r.carrera}</td><td className="num">{fmt(r.indice)}</td></tr>)}</tbody></table>}
            </> : <p className="rp-lead">Ningún estudiante tiene un CRR menor de 34.</p>}
          </section>}

          {S("cierre") && <section className="rp-page">
            <Cab n={7} t="Conclusiones y recomendaciones" />
            <h3 className="rp-h3">Conclusiones</h3>
            <ul className="rp-list">{txt.conclusiones.map((h, i) => <E key={i} id={"c" + i} as="li">{h}</E>)}</ul>
            <h3 className="rp-h3">Recomendaciones</h3>
            <ol className="rp-list num">{txt.recomendaciones.map((h, i) => <E key={i} id={"r" + i} as="li">{h}</E>)}</ol>
            <div className="rp-metodo">
              <b>Cómo se calcula el CRR.</b> Cada carrera reparte 100 puntos entre las 24 competencias según lo que más importa en su perfil profesional;
              las competencias de riesgo cuentan al revés (menos es mejor). Los estudiantes sin perfil de carrera usan el promedio simple de las competencias positivas.
              Los datos de la simulación solo incluyen a quienes la completaron.
            </div>
          </section>}
        </>}
      </div>
    </div>
  );
}

function Kpi({ label, v, sub, tone }: { label: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return <div className={"rp-kpi" + (tone ? " " + tone : "")}><small>{label}</small><b>{v}</b>{sub && <span>{sub}</span>}</div>;
}
function Cab({ n, t }: { n: number; t: ReactNode }) {
  return <div className="rp-cab"><span>{String(n).padStart(2, "0")}</span><h2>{t}</h2></div>;
}
