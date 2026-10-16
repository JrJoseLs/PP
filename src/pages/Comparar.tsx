import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { Empty, Icon, Segmented } from "../components/ui";
import { Radar, type Series } from "../components/Radar";
import { LevelBar, MetricBars } from "../components/Charts";
import { SIN_CARRERA, SIN_GRUPO, avgIndex, avgVector, displayName, fmt, isRisk, levelCounts, normText, plural, sparseMetrics, type Row } from "../lib/metrics";
import { SERIES_COLORS, byClase, byDecano, byField, byMaestro, type Group } from "../lib/groups";
import { PageHead } from "./Dashboard";
import FilterBar, { FILTER_INPUT_ID } from "../components/FilterBar";
import { useScoped } from "../lib/scope";
import { D, low, M, metricDesc, metricName } from "../lib/labels";

const MAX = 8;

export default function Comparar() {
  const { snap: snapAll, metrics, user } = useApp();
  // se compara dentro del ámbito elegido (mismos filtros que Inicio y Estudiantes)
  const { rows, rowsByClase, clases, active: scoped, allRows } = useScoped();
  const snap = useMemo(() => ({ ...snapAll, clases }), [snapAll, clases]);
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = usePref<string[]>("cmpSel_" + user!.id, []);
  const [view, setView] = usePref<"radar" | "barras" | "tabla">("cmpView", "radar");
  const [invert, setInvert] = usePref("radarInvert", true);
  const [hideSparse, setHideSparse] = useState(true);
  const [bdOpen, setBdOpen] = useState(false);
  const bdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bdOpen) return;
    const close = (e: MouseEvent) => { if (!bdRef.current?.contains(e.target as Node)) setBdOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [bdOpen]);
  const rol = user!.rol;

  const pool = useMemo(() => {
    const m = new Map<string, Group>();
    const add = (gs: Group[]) => gs.forEach((g) => m.set(g.id, g));
    add(byClase(snap.clases, rowsByClase));
    if (rol !== "maestro") add(byMaestro(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length));
    if (rol === "admin") add(byDecano(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length));
    add(byField(rows, "carrera")); add(byField(rows, "grupo")); add(byField(rows, "equipo"));
    m.set("todos", { id: "todos", kind: "todos", label: scoped ? "Promedio del filtro" : "Promedio general", sub: rows.length + " estudiantes", color: "", rows });
    if (scoped) m.set("global", { id: "global", kind: "todos", label: "Todo (sin filtros)", sub: allRows.length + " estudiantes", color: "", rows: allRows });
    rows.forEach((r) => m.set("est:" + r.r.id, { id: "est:" + r.r.id, kind: "estudiante", label: displayName(r.r.nombre), sub: r.cls.nombre, color: "", rows: [r] }));
    return m;
  }, [snap, rows, rowsByClase, rol, scoped, allRows]);

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

  // personas (no son filtros): se ofrecen en el buscador solo para comparar
  const extra = (n: string) => [...pool.values()].filter((g) => (g.kind === "maestro" || g.kind === "decano") && normText(g.label).includes(n))
    .map((g) => ({ key: g.id, label: g.label, sub: (g.kind === "maestro" ? M().one : D().one) + " · " + g.sub }));
  const focusSearch = () => { const el = document.getElementById(FILTER_INPUT_ID) as HTMLInputElement | null; el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus(); };
  // "Desglosar por…": un clic compara todos los grupos de una dimensión dentro del filtro (los más grandes primero)
  const dims: { kind: Group["kind"]; label: string }[] = [
    { kind: "clase", label: "Clase" },
    ...(rol !== "maestro" ? [{ kind: "maestro" as const, label: M().one }] : []),
    ...(rol === "admin" ? [{ kind: "decano" as const, label: D().one }] : []),
    { kind: "carrera", label: "Carrera" }, { kind: "grupo", label: "Grupo" }, { kind: "equipo", label: "Equipo" },
  ];
  const breakdown = dims.map((d) => ({ ...d, ids: [...pool.values()].filter((g) => g.kind === d.kind && g.rows.length && g.label !== SIN_CARRERA && g.label !== "Grupo " + SIN_GRUPO)
    .sort((a, b) => b.rows.length - a.rows.length).slice(0, MAX).map((g) => g.id) })).filter((d) => d.ids.length > 1);
  const addRef = (id: string) => setSel([...valid.filter((x) => x !== id), id].slice(-MAX));

  if (!snapAll.clases.length) return <><PageHead title="Comparar" /><Empty icon="compare" title="No hay datos para comparar todavía" /></>;

  return (
    <>
      <PageHead title="Comparar" sub="Busca lo que quieras comparar y añádelo. El mismo buscador filtra, si quieres comparar dentro de una clase, una carrera o un equipo." />

      <FilterBar summary={scoped ? <>Comparando dentro de <b>{plural(rows.length, "estudiante", "estudiantes")}</b></> : undefined}
        compare={{ selected: valid, full: valid.length >= MAX, toggle, extra }} />

      <section className="card pad composer">
        <div className="composer-h">
          <h3>Comparando{chosen.length > 0 && <span className="count-pill">{chosen.length}/{MAX}</span>}</h3>
          <div className="composer-actions">
            {breakdown.length > 0 && (
              <div className="fmenu" ref={bdRef}>
                <button className={"fbtn" + (bdOpen ? " open" : "")} onClick={() => setBdOpen(!bdOpen)}>Desglosar por<Icon name="chevron" size={12} /></button>
                {bdOpen && (
                  <div className="fpop bdpop">
                    <p className="muted tiny pad-x">Compara todos los grupos de un tipo{scoped ? " dentro del filtro" : ""}</p>
                    {breakdown.map((d) => (
                      <button key={d.kind} className="fopt-btn" onClick={() => { setSel(d.ids); setBdOpen(false); }}>
                        <span>{d.label}</span><small>{d.ids.length === MAX ? `los ${MAX} mayores` : d.ids.length}</small>
                      </button>
                    ))}
                    <p className="muted tiny pad-x bd-sep">Referencias</p>
                    <button className="fopt-btn" onClick={() => { addRef("todos"); setBdOpen(false); }}><span>+ {scoped ? "Promedio del filtro" : "Promedio general"}</span></button>
                    {scoped && <button className="fopt-btn" onClick={() => { addRef("global"); setBdOpen(false); }}><span>+ Todo (sin filtros)</span></button>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


        {chosen.length === 0 ? (
          <div className="composer-empty">
            <p>Aún no hay nada que comparar. Empieza con un clic:</p>
            <div className="row-gap wrap">
              {breakdown.slice(0, 4).map((d) => <button key={d.kind} className="bd" onClick={() => setSel(d.ids)}>Por {low(d.label)}<small>{d.ids.length}</small></button>)}
              <button className="bd" onClick={focusSearch}><Icon name="search" size={13} /> Buscar arriba</button>
            </div>
          </div>
        ) : (
          <div className="series-grid">
            {chosen.map((g) => (
              <div className="scard" key={g.id} style={{ ["--c" as string]: g.color }}>
                <button className="scard-x" onClick={() => toggle(g.id)} aria-label={"Quitar " + g.label}><Icon name="close" size={12} /></button>
                <div className="scard-h"><span className="dot" style={{ background: g.color }} /><b title={g.label}>{g.label}</b></div>
                <div className="scard-v">{fmt(g.idx)}<small>{g.rows.length} est.</small></div>
                <LevelBar rows={g.rows as Row[]} />
              </div>
            ))}
            {valid.length < MAX && <button className="scard add" onClick={focusSearch}><Icon name="plus" size={18} /><span>Añadir</span></button>}
          </div>
        )}
        {chosen.length > 1 && <button className="link small composer-clear" onClick={() => setSel([])}>Quitar todo</button>}
      </section>

      {chosen.length > 0 && (
        <section className="card pad">
          <div className="card-h">
            <Segmented value={view} onChange={setView} options={[{ value: "radar", label: "Araña" }, { value: "barras", label: "Barras" }, { value: "tabla", label: "Tabla" }]} />
            <label className="switch-label"><input type="checkbox" className="switch" checked={hideSparse} onChange={(e) => setHideSparse(e.target.checked)} /> Ocultar competencias casi vacías</label>
          </div>
          {view === "radar" && <Radar labels={labels} series={series} invert={invert} onInvert={setInvert} size={640} title="comparacion" />}
          {view === "barras" && <MetricBars labels={labels} series={series} />}
          {view === "tabla" && <DiffTable labels={labels} chosen={chosen.map((g) => ({ label: g.label, color: g.color, values: vecFor(g.vector) }))} />}
        </section>
      )}

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
                <td className={isRisk(m) ? "risk" : ""} title={metricDesc(m)}>{metricName(m)}{isRisk(m) ? " ↓" : ""}</td>
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
