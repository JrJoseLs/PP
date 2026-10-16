import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { useShell } from "../components/Layout";
import { Avatar, Empty, Icon, LevelChip, Segmented, Stat } from "../components/ui";
import { Radar, type Series } from "../components/Radar";
import { Histogram, LevelBar, Ring } from "../components/Charts";
import { avgIndex, avgVector, displayName, fmt, isRisk, levelCounts, plural, sparseMetrics, type Row } from "../lib/metrics";
import { byClase, byDecano, byMaestro, summarize, type Group } from "../lib/groups";
import FilterBar from "../components/FilterBar";
import { useScoped } from "../lib/scope";

function greeting() { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; }

import { D, low, M, metricName } from "../lib/labels";

export default function Dashboard() {
  const { user, snap: snapAll, metrics, ready } = useApp();
  // todo el panel respeta el ámbito elegido (los mismos filtros que Estudiantes y Comparar)
  const { rows, rowsByClase, clases, active: scoped, allRows } = useScoped();
  const snap = useMemo(() => ({ ...snapAll, clases }), [snapAll, clases]);
  const { openStudent } = useShell();
  const go = useNavigate();
  const [view, setView] = usePref<"clase" | "maestro" | "decano" | "total">("dashRadar_" + user!.rol, user!.rol === "admin" ? "decano" : user!.rol === "decano" ? "maestro" : "clase");
  const [invert, setInvert] = usePref("radarInvert", true);
  const rol = user!.rol;

  const d = useMemo(() => {
    const classes = byClase(snap.clases, rowsByClase).map((g) => summarize(g, metrics));
    const maestros = byMaestro(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length).map((g) => summarize(g, metrics));
    const decanos = byDecano(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length).map((g) => summarize(g, metrics));
    const lv = levelCounts(rows);
    const sparse = sparseMetrics(rows, metrics);
    const overall = avgVector(rows, metrics);
    const attention = rows.filter((r) => r.indice !== null && r.indice < 34).sort((a, b) => a.indice! - b.indice!);
    return { classes, maestros, decanos, lv, sparse, overall, attention, idx: avgIndex(rows) };
  }, [snap, rows, rowsByClase, metrics]);

  const insights = useMemo(() => buildInsights(d, metrics, snap, rol), [d, metrics, snap, rol]);

  if (!ready) return null;
  const first = user!.nombre.replace(/^(Dra?|Mtro|Mtra)\.\s*/i, "").split(" ")[0];
  const today = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  if (!snapAll.clases.length) return (
    <>
      <PageHead eyebrow={today} title={`${greeting()}, ${first}`} />
      <Empty icon="classes" title={rol === "admin" ? "Empieza importando tus clases" : "Aún no tienes clases"}>
        {rol === "admin" ? <><p>Sube los informes del juego (Excel) y el listado de estudiantes. Después entrega cada clase a su {low(D().one)}.</p>
          <Link className="btn primary" to="/importar"><Icon name="upload" size={16} /> Importar clases</Link></>
          : rol === "decano" ? <p>Administración todavía no te ha entregado clases. Cuando lo haga, aparecerán aquí y podrás asignarlas a tus {low(M().many)}.</p>
          : <p>Todavía no tienes clases asignadas. Cuando te asignen una, aparecerá aquí automáticamente.</p>}
      </Empty>
    </>
  );

  const radarGroups: (Group & { vector: (number | null)[] })[] =
    view === "maestro" && rol !== "maestro" ? d.maestros.slice(0, 8)
    : view === "decano" && rol === "admin" ? d.decanos
    : view === "total" ? [{ id: "t", kind: "todos", label: scoped ? "Promedio del filtro" : "Promedio general", color: "var(--accent)", rows, vector: d.overall }]
    : d.classes.slice(0, 8);
  const radarLabels = metrics.filter((m) => !d.sparse.has(m));
  const pick = (v: (number | null)[]) => radarLabels.map((m) => v[metrics.indexOf(m)]) as number[];
  const series: Series[] = radarGroups.map((g) => ({ name: g.label, color: g.color, values: pick(g.vector), index: avgIndex(g.rows) }));
  if (view !== "total" && radarGroups.length > 1) series.push({ name: scoped ? "Promedio del filtro" : "Promedio general", color: "var(--text-3)", values: pick(d.overall), dash: true, muted: true });
  // referencia: cómo se ve todo, sin filtros
  if (scoped) series.push({ name: "Todo (sin filtros)", color: "var(--accent-2)", values: pick(avgVector(allRows, metrics)), dash: true, muted: true });
  const scopeTxt = [plural(snap.clases.length, "clase", "clases"),
    rol !== "maestro" && plural(snap.profiles.filter((p) => p.rol === "maestro").length, low(M().one), low(M().many)),
    rol === "admin" && plural(snap.profiles.filter((p) => p.rol === "decano").length, low(D().one), low(D().many)),
    plural(rows.length, "estudiante", "estudiantes")].filter(Boolean).join(" · ");

  return (
    <>
      <PageHead eyebrow={today} title={`${greeting()}, ${first}`} sub={scopeTxt} />
      <FilterBar summary={scoped ? <>Viendo <b>{plural(rows.length, "estudiante", "estudiantes")}</b> de {allRows.length}</> : undefined} />
      {scoped && !rows.length ? <Empty icon="search" title="Nada coincide con estos filtros">Quita alguno de los filtros de arriba.</Empty> : <>

      <div className="stats">
        <Stat label="Índice promedio" value={<span className="row-gap"><Ring value={d.idx} size={52} stroke={6} />{fmt(d.idx)}</span>} sub="Competencias positivas, 0–100" />
        <Stat label="Estudiantes" value={rows.length} sub={plural(snap.clases.length, "clase", "clases")} />
        <Stat label="Nivel alto" value={d.lv.total ? Math.round((d.lv.alto / d.lv.total) * 100) + "%" : "—"} tone="good" sub={`${d.lv.alto} con índice ≥ 66`} />
        <Stat label="Necesitan apoyo" value={d.lv.bajo} tone="bad" sub={d.lv.total ? `${Math.round((d.lv.bajo / d.lv.total) * 100)}% con índice < 34` : ""} />
      </div>

      <div className="grid-main">
        <section className="card pad">
          <div className="card-h">
            <h3>Huella de competencias</h3>
            <Segmented size="sm" value={view} onChange={setView} options={[
              { value: "clase", label: "Clases" },
              ...(rol !== "maestro" ? [{ value: "maestro" as const, label: M().many }] : []),
              ...(rol === "admin" ? [{ value: "decano" as const, label: D().many }] : []),
              { value: "total", label: "General" },
            ]} />
          </div>
          <Radar labels={radarLabels} series={series} invert={invert} onInvert={setInvert} size={600} />
        </section>

        <section className="card pad insights">
          <h3><Icon name="spark" size={18} /> Hallazgos</h3>
          <ul>{insights.map((it, i) => (
            <li key={i} className={"ins " + it.tone}>
              <span className="ins-dot" />
              <div>{it.text}{it.to && <button className="link" onClick={() => go(it.to!)}>{it.cta ?? "Ver"} <Icon name="chevron" size={12} /></button>}</div>
            </li>))}</ul>
          <div className="mt">
            <h4 className="sub-h">Distribución del índice</h4>
            <Histogram rows={rows} />
            <LevelBar rows={rows} showLabels height={10} />
          </div>
        </section>
      </div>

      <div className="grid2">
        <RankCard title="Clases" items={d.classes} onPick={(g) => go("/clases/" + g.id.split(":")[1])} />
        {rol !== "maestro" ? <RankCard title={M().many} items={d.maestros} avatar empty={`Aún no hay ${low(M().many)} con clases asignadas.`}
          onPick={(g) => go("/comparar?add=" + encodeURIComponent(g.id))} />
          : <AttentionCard rows={d.attention} onPick={(r) => openStudent(r.r.id, d.attention.map((x) => x.r.id))} />}
      </div>
      {rol === "admin" && d.decanos.length > 0 && (
        <div className="grid2">
          <RankCard title={D().many} items={d.decanos} avatar onPick={(g) => go("/comparar?add=" + encodeURIComponent(g.id))} />
          <AttentionCard rows={d.attention} onPick={(r) => openStudent(r.r.id, d.attention.map((x) => x.r.id))} />
        </div>
      )}
      {rol === "decano" && <AttentionCard rows={d.attention} onPick={(r) => openStudent(r.r.id, d.attention.map((x) => x.r.id))} />}
      </>}
    </>
  );
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

type Sum = ReturnType<typeof summarize>;
function RankCard({ title, items, onPick, avatar, empty }: { title: string; items: Sum[]; onPick(g: Sum): void; avatar?: boolean; empty?: string }) {
  const sorted = [...items].sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1));
  return (
    <section className="card pad">
      <div className="card-h"><h3>{title}</h3><span className="muted small">por índice promedio</span></div>
      {!sorted.length && <p className="muted">{empty}</p>}
      <ol className="rank">
        {sorted.map((g, i) => (
          <li key={g.id}>
            <button type="button" onClick={() => onPick(g)}>
              <span className="rank-n">{i + 1}</span>
              {avatar ? <Avatar name={g.label} size={30} color={g.color} /> : <span className="sw" style={{ background: g.color }} />}
              <span className="rank-txt"><b>{g.label}</b><small>{g.sub} · {g.n} est.</small></span>
              <span className="rank-bar"><LevelBar rows={g.rows} /></span>
              <span className="rank-v">{fmt(g.indice)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AttentionCard({ rows, onPick }: { rows: Row[]; onPick(r: Row): void }) {
  return (
    <section className="card pad">
      <div className="card-h"><h3>Necesitan apoyo</h3><span className="muted small">{rows.length} con índice &lt; 34</span></div>
      {!rows.length ? <p className="muted">Nadie por debajo de 34. Buen trabajo.</p> : (
        <ul className="people">
          {rows.slice(0, 8).map((r) => (
            <li key={r.r.id}><button type="button" onClick={() => onPick(r)}>
              <Avatar name={r.r.nombre} size={32} color={r.cls.color} />
              <span className="rank-txt"><b>{displayName(r.r.nombre)}</b><small>{r.cls.nombre} · {r.carrera}</small></span>
              <LevelChip v={r.indice} /><span className="rank-v plain">{fmt(r.indice)}</span>
            </button></li>
          ))}
        </ul>
      )}
      {rows.length > 8 && <Link className="link" to="/estudiantes?nivel=bajo">Ver los {rows.length} <Icon name="chevron" size={12} /></Link>}
    </section>
  );
}

/* ---------- Hallazgos automáticos ---------- */
interface Insight { text: ReactNode; tone: "good" | "bad" | "info" | "warn"; to?: string; cta?: string; }
function buildInsights(d: { classes: Sum[]; maestros: Sum[]; overall: (number | null)[]; sparse: Set<string>; lv: ReturnType<typeof levelCounts>; idx: number | null },
  metrics: string[], snap: ReturnType<typeof useApp>["snap"], rol: string): Insight[] {
  const out: Insight[] = [];
  const cls = d.classes.filter((c) => c.indice !== null);
  if (rol === "admin") {
    const noDec = snap.clases.filter((c) => !c.decanos.length).length;
    if (noDec) out.push({ tone: "warn", text: <><b>{plural(noDec, "clase", "clases")}</b> sin {low(D().one)}: nadie más que tú puede verlas.</>, to: "/equipo?tab=clases", cta: "Asignar" });
  }
  if (rol !== "maestro") {
    const noM = snap.clases.filter((c) => !c.maestros.length);
    if (noM.length) out.push({ tone: "warn", text: <><b>{noM.length === 1 ? noM[0].nombre : plural(noM.length, "clase", "clases")}</b> {noM.length === 1 ? "no tiene" : "no tienen"} {low(M().one)} asignado.</>, to: "/equipo?tab=clases", cta: "Asignar" });
  }
  if (cls.length > 1) {
    const s = [...cls].sort((a, b) => b.indice! - a.indice!);
    out.push({ tone: "good", text: <><b>{s[0].label}</b> lidera con índice <b>{fmt(s[0].indice)}</b>, {fmt(s[0].indice! - s[s.length - 1].indice!)} puntos sobre <b>{s[s.length - 1].label}</b>.</>, to: `/comparar?add=${encodeURIComponent(s[0].id)},${encodeURIComponent(s[s.length - 1].id)}`, cta: "Comparar" });
    // competencia con mayor brecha entre clases
    let best: { m: string; gap: number; hi: Sum; lo: Sum } | null = null;
    metrics.forEach((m, i) => {
      if (d.sparse.has(m)) return;
      const v = cls.filter((c) => c.vector[i] !== null);
      if (v.length < 2) return;
      const hi = v.reduce((a, b) => (b.vector[i]! > a.vector[i]! ? b : a)), lo = v.reduce((a, b) => (b.vector[i]! < a.vector[i]! ? b : a));
      const gap = hi.vector[i]! - lo.vector[i]!;
      if (!best || gap > best.gap) best = { m, gap, hi: isRisk(m) ? lo : hi, lo: isRisk(m) ? hi : lo };
    });
    if (best) { const b = best as { m: string; gap: number; hi: Sum; lo: Sum };
      out.push({ tone: "info", text: <>La mayor brecha está en <b>{metricName(b.m)}</b>: {fmt(b.gap)} puntos entre <b>{b.hi.label}</b> y <b>{b.lo.label}</b>.</> }); }
  }
  const pos = metrics.map((m, i) => ({ m, v: d.overall[i] })).filter((x) => x.v !== null && !isRisk(x.m) && !d.sparse.has(x.m)).sort((a, b) => b.v! - a.v!);
  if (pos.length > 1) {
    out.push({ tone: "good", text: <>Fortaleza general: <b>{metricName(pos[0].m)}</b> ({fmt(pos[0].v)}).</> });
    out.push({ tone: "bad", text: <>Lo más débil: <b>{metricName(pos[pos.length - 1].m)}</b> ({fmt(pos[pos.length - 1].v)}). Buen foco para la próxima sesión.</> });
  }
  const risk = metrics.map((m, i) => ({ m, v: d.overall[i] })).filter((x) => x.v !== null && isRisk(x.m) && !d.sparse.has(x.m)).sort((a, b) => b.v! - a.v!);
  if (risk[0] && risk[0].v! >= 35) out.push({ tone: "warn", text: <>Riesgo más alto: <b>{metricName(risk[0].m)}</b> en {fmt(risk[0].v)} (aquí menos es mejor).</> });
  if (rol !== "maestro" && d.maestros.length > 1) {
    const att = [...d.maestros].sort((a, b) => b.levels.bajo / (b.levels.total || 1) - a.levels.bajo / (a.levels.total || 1))[0];
    if (att && att.levels.bajo) out.push({ tone: "info", text: <>El grupo de <b>{att.label}</b> concentra la mayor proporción en nivel bajo ({Math.round((att.levels.bajo / (att.levels.total || 1)) * 100)}%).</>, to: `/comparar?add=${encodeURIComponent(att.id)}`, cta: "Analizar" });
  }
  return out.slice(0, 6);
}
