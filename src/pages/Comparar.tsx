import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { Avatar, Empty, Icon, Segmented } from "../components/ui";
import { Radar, type Series } from "../components/Radar";
import { LevelBar, MetricBars } from "../components/Charts";
import { avgIndex, avgVector, displayName, fmt, isRisk, levelCounts, normText, sparseMetrics, type Row } from "../lib/metrics";
import { SERIES_COLORS, byClase, byDecano, byField, byMaestro, type Group } from "../lib/groups";
import { PageHead } from "./Dashboard";

const MAX = 8;
type Kind = "clase" | "maestro" | "decano" | "carrera" | "grupo" | "est";

export default function Comparar() {
  const { snap, rows, rowsByClase, metrics, user } = useApp();
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = usePref<string[]>("cmpSel_" + user!.id, []);
  const [view, setView] = usePref<"radar" | "barras" | "tabla">("cmpView", "radar");
  const [invert, setInvert] = usePref("radarInvert", true);
  const [tab, setTab] = useState<Kind>("clase");
  const [q, setQ] = useState("");
  const [hideSparse, setHideSparse] = useState(true);
  const rol = user!.rol;

  const pool = useMemo(() => {
    const m = new Map<string, Group>();
    const add = (gs: Group[]) => gs.forEach((g) => m.set(g.id, g));
    add(byClase(snap.clases, rowsByClase));
    if (rol !== "maestro") add(byMaestro(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length));
    if (rol === "admin") add(byDecano(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length));
    add(byField(rows, "carrera")); add(byField(rows, "grupo"));
    m.set("todos", { id: "todos", kind: "todos", label: "Promedio general", sub: rows.length + " estudiantes", color: "", rows });
    rows.forEach((r) => m.set("est:" + r.r.id, { id: "est:" + r.r.id, kind: "estudiante", label: displayName(r.r.nombre), sub: r.cls.nombre, color: "", rows: [r] }));
    return m;
  }, [snap, rows, rowsByClase, rol]);

  // selección: ?add= en la URL tiene prioridad (enlaces desde Inicio o una clase)
  const [sel, setSelState] = useState<string[]>(() => {
    const fromUrl = params.get("add")?.split(",").filter(Boolean);
    return fromUrl?.length ? fromUrl : saved;
  });
  useEffect(() => { if (params.get("add")) { setParams({}, { replace: true }); } }, []); // eslint-disable-line
  const setSel = (s: string[]) => { setSelState(s); setSaved(s); };
  const valid = sel.filter((id) => pool.has(id));
  useEffect(() => {
    if (!valid.length && pool.size > 1) {
      const def = rol === "maestro" ? [...pool.values()].filter((g) => g.kind === "clase").slice(0, 3).map((g) => g.id)
        : rol === "decano" ? [...pool.values()].filter((g) => g.kind === "maestro").slice(0, 4).map((g) => g.id)
        : [...pool.values()].filter((g) => g.kind === "decano").map((g) => g.id);
      const d = def.length > 1 ? def : [...def, "todos"];
      setSelState(d);
    }
  }, [pool]); // eslint-disable-line

  const chosen = valid.map((id, i) => {
    const g = pool.get(id)!;
    return { ...g, color: SERIES_COLORS[i % SERIES_COLORS.length], vector: avgVector(g.rows, metrics), idx: avgIndex(g.rows), lv: levelCounts(g.rows) };
  });
  const sparse = sparseMetrics(rows, metrics);
  const labels = hideSparse ? metrics.filter((m) => !sparse.has(m)) : metrics;
  const vecFor = (v: (number | null)[]) => labels.map((m) => v[metrics.indexOf(m)]);
  const series: Series[] = chosen.map((g) => ({ name: g.label, color: g.color, values: vecFor(g.vector) as number[] }));
  const toggle = (id: string) => setSel(valid.includes(id) ? valid.filter((x) => x !== id) : valid.length >= MAX ? valid : [...valid, id]);

  const tabs: { value: Kind; label: string }[] = [
    { value: "clase", label: "Clases" },
    ...(rol !== "maestro" ? [{ value: "maestro" as Kind, label: "Maestros" }] : []),
    ...(rol === "admin" ? [{ value: "decano" as Kind, label: "Decanos" }] : []),
    { value: "carrera", label: "Carreras" }, { value: "grupo", label: "Grupos" }, { value: "est", label: "Estudiantes" },
  ];
  const n = normText(q);
  const options = [...pool.values()].filter((g) => (tab === "est" ? g.kind === "estudiante" : g.kind === tab) && (!n || normText(g.label + " " + (g.sub ?? "")).includes(n)));
  const presets = [
    { label: "Mis clases", ids: [...pool.values()].filter((g) => g.kind === "clase").slice(0, MAX).map((g) => g.id) },
    ...(rol !== "maestro" ? [{ label: "Mis maestros", ids: [...pool.values()].filter((g) => g.kind === "maestro").slice(0, MAX).map((g) => g.id) }] : []),
    ...(rol === "admin" ? [{ label: "Decanos", ids: [...pool.values()].filter((g) => g.kind === "decano").map((g) => g.id) }] : []),
    { label: "Carreras", ids: [...pool.values()].filter((g) => g.kind === "carrera").slice(0, MAX).map((g) => g.id) },
  ].filter((p) => p.ids.length > 1);

  if (!snap.clases.length) return <><PageHead title="Comparar" /><Empty icon="compare" title="No hay datos para comparar todavía" /></>;

  return (
    <>
      <PageHead title="Comparar" sub="Elige hasta 8 elementos: clases, maestros, carreras, grupos o estudiantes, y compáralos sobre las mismas competencias." />

      <div className="cmp">
        <aside className="card cmp-pick">
          <div className="cmp-tabs">{tabs.map((t) => <button key={t.value} type="button" className={"ctab" + (tab === t.value ? " on" : "")} onClick={() => { setTab(t.value); setQ(""); }}>{t.label}</button>)}</div>
          <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "est" ? "Nombre o matrícula" : "Filtrar"} /></label>
          <div className="cmp-list">
            {(tab === "est" ? options.slice(0, 60) : options).map((g) => {
              const on = valid.includes(g.id), i = valid.indexOf(g.id);
              return (
                <button key={g.id} type="button" className={"cmp-opt" + (on ? " on" : "")} onClick={() => toggle(g.id)} disabled={!on && valid.length >= MAX}>
                  {g.kind === "maestro" || g.kind === "decano" || g.kind === "estudiante" ? <Avatar name={g.label} size={26} color={on ? SERIES_COLORS[i % SERIES_COLORS.length] : undefined} />
                    : <span className="sw" style={{ background: on ? SERIES_COLORS[i % SERIES_COLORS.length] : g.kind === "clase" ? g.color : "var(--fill-3)" }} />}
                  <span className="rank-txt"><b>{g.label}</b><small>{g.sub}</small></span>
                  <span className={"check" + (on ? " on" : "")}>{on && <Icon name="check" size={13} />}</span>
                </button>
              );
            })}
            {tab === "est" && !n && <p className="muted small pad-x">Escribe para buscar entre {rows.length} estudiantes.</p>}
            {!options.length && n && <p className="muted small pad-x">Sin coincidencias.</p>}
          </div>
          <div className="cmp-presets">
            <span className="muted tiny">Atajos</span>
            {presets.map((p) => <button key={p.label} className="pill btnish" onClick={() => setSel(p.ids)}>{p.label}</button>)}
            <button className="pill btnish" onClick={() => setSel([...valid.filter((x) => x !== "todos"), "todos"].slice(-MAX))}>+ Promedio general</button>
          </div>
        </aside>

        <section className="cmp-main">
          <div className="sel-chips">
            {chosen.map((g) => (
              <span key={g.id} className="schip" style={{ ["--c" as string]: g.color }}>
                <span className="dot" style={{ background: g.color }} />{g.label}
                <button onClick={() => toggle(g.id)} aria-label={"Quitar " + g.label}><Icon name="close" size={12} /></button>
              </span>
            ))}
            {chosen.length > 0 && <button className="link small" onClick={() => setSel([])}>Limpiar</button>}
          </div>

          {chosen.length === 0 ? <Empty icon="compare" title="Elige qué comparar">Selecciona elementos en el panel o usa un atajo.</Empty> : (
            <>
              <div className="cmp-cards">
                {chosen.map((g) => (
                  <div className="card mini" key={g.id} style={{ ["--c" as string]: g.color }}>
                    <div className="mini-h"><span className="dot" style={{ background: g.color }} /><b>{g.label}</b></div>
                    <div className="mini-v">{fmt(g.idx)}<small> índice</small></div>
                    <LevelBar rows={g.rows as Row[]} />
                    <small className="muted">{g.rows.length} est. · {g.lv.total ? Math.round((g.lv.alto / g.lv.total) * 100) : 0}% alto · {g.lv.total ? Math.round((g.lv.bajo / g.lv.total) * 100) : 0}% bajo</small>
                  </div>
                ))}
              </div>

              <div className="card pad">
                <div className="card-h">
                  <Segmented value={view} onChange={setView} options={[{ value: "radar", label: "Araña" }, { value: "barras", label: "Barras" }, { value: "tabla", label: "Tabla" }]} />
                  <label className="switch-label"><input type="checkbox" className="switch" checked={hideSparse} onChange={(e) => setHideSparse(e.target.checked)} /> Ocultar competencias casi vacías</label>
                </div>
                {view === "radar" && <Radar labels={labels} series={series} invert={invert} onInvert={setInvert} size={620} />}
                {view === "barras" && <MetricBars labels={labels} series={series} />}
                {view === "tabla" && <DiffTable labels={labels} chosen={chosen.map((g) => ({ label: g.label, color: g.color, values: vecFor(g.vector) }))} />}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function DiffTable({ labels, chosen }: { labels: string[]; chosen: { label: string; color: string; values: (number | null)[] }[] }) {
  const two = chosen.length === 2;
  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead><tr><th>Competencia</th>{chosen.map((c) => <th key={c.label}><span className="dot" style={{ background: c.color }} /> {c.label}</th>)}{two && <th>Δ</th>}<th>Brecha</th></tr></thead>
        <tbody>
          {labels.map((m, i) => {
            const vs = chosen.map((c) => c.values[i]);
            const ok = vs.filter((v): v is number => v !== null);
            const best = ok.length ? (isRisk(m) ? Math.min(...ok) : Math.max(...ok)) : null;
            const worst = ok.length ? (isRisk(m) ? Math.max(...ok) : Math.min(...ok)) : null;
            return (
              <tr key={m}>
                <td className={isRisk(m) ? "risk" : ""}>{m}{isRisk(m) ? " ↓" : ""}</td>
                {vs.map((v, k) => <td key={k} className={"num" + (ok.length > 1 && v === best ? " best" : ok.length > 1 && v === worst ? " worst" : "")}>{fmt(v)}</td>)}
                {two && <td className="num">{vs[0] !== null && vs[1] !== null ? <span className={(isRisk(m) ? vs[0]! < vs[1]! : vs[0]! > vs[1]!) ? "pos" : "neg"}>{(vs[0]! - vs[1]! >= 0 ? "+" : "") + (vs[0]! - vs[1]!).toFixed(1)}</span> : "—"}</td>}
                <td className="num muted">{best !== null && worst !== null ? fmt(Math.abs(best - worst)) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted tiny">Verde = mejor valor de la fila · rojo = peor. En las competencias ↓ menos es mejor.</p>
    </div>
  );
}
