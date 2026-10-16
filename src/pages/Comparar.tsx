/* Comparar, en dos pasos:
   1. ¿Dentro de qué? (opcional) — la barra de filtros de siempre (clase, carrera, equipo…).
   2. ¿Qué comparas? — eliges el tipo y marcas en la lista lo que quieras (con su índice a la vista).
   Atajos: todos, los 5 mejores, los 5 más bajos; referencias: promedio del filtro y todo sin filtros. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { useShell } from "../components/Layout";
import { Avatar, Empty, Icon, Segmented } from "../components/ui";
import { Radar, type Series } from "../components/Radar";
import { LevelBar, MetricBars } from "../components/Charts";
import { SIN_CARRERA, SIN_GRUPO, avgIndex, avgVector, displayName, fmt, isRisk, levelCounts, levelOf, normText, plural, sparseMetrics, type Row } from "../lib/metrics";
import { SERIES_COLORS, byClase, byDecano, byField, byMaestro, type Group } from "../lib/groups";
import { PageHead } from "./Dashboard";
import FilterBar from "../components/FilterBar";
import { useScoped } from "../lib/scope";
import { D, M, metricDesc, metricName } from "../lib/labels";

const MAX = 8;
type Tipo = "clase" | "maestro" | "decano" | "carrera" | "grupo" | "equipo" | "estudiante";

export default function Comparar() {
  const { snap: snapAll, metrics, user } = useApp();
  const { openStudent } = useShell();
  // se compara dentro del filtro elegido (el mismo de Inicio y Estudiantes)
  const { rows, rowsByClase, clases, active: scoped, allRows } = useScoped();
  const snap = useMemo(() => ({ ...snapAll, clases }), [snapAll, clases]);
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = usePref<string[]>("cmpSel_" + user!.id, []);
  const [view, setView] = usePref<"radar" | "barras" | "tabla">("cmpView", "radar");
  const [invert, setInvert] = usePref("radarInvert", true);
  const [tipo, setTipo] = usePref<Tipo>("cmpTipo_" + user!.id, user!.rol === "maestro" ? "clase" : "maestro");
  const [orden, setOrden] = usePref<"indice" | "nombre">("cmpOrden", "indice");
  const [q, setQ] = useState("");
  const [hideSparse, setHideSparse] = useState(true);
  const rol = user!.rol;

  const pool = useMemo(() => {
    const m = new Map<string, Group>();
    const add = (gs: Group[]) => gs.forEach((g) => m.set(g.id, g));
    add(byClase(snap.clases, rowsByClase).filter((g) => g.rows.length));
    if (rol !== "maestro") add(byMaestro(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length));
    if (rol === "admin") add(byDecano(snap.profiles, snap.clases, rowsByClase).filter((g) => g.rows.length));
    add(byField(rows, "carrera").filter((g) => g.label !== SIN_CARRERA));
    add(byField(rows, "grupo").filter((g) => g.label !== "Grupo " + SIN_GRUPO));
    add(byField(rows, "equipo"));
    m.set("todos", { id: "todos", kind: "todos", label: scoped ? "Promedio del filtro" : "Promedio general", sub: plural(rows.length, "estudiante", "estudiantes"), color: "", rows });
    if (scoped) m.set("global", { id: "global", kind: "todos", label: "Todo (sin filtros)", sub: plural(allRows.length, "estudiante", "estudiantes"), color: "", rows: allRows });
    rows.forEach((r) => m.set("est:" + r.r.id, { id: "est:" + r.r.id, kind: "estudiante", label: displayName(r.r.nombre), sub: `${r.cls.nombre} · ${r.carrera}`, color: "", rows: [r] }));
    return m;
  }, [snap, rows, rowsByClase, rol, scoped, allRows]);

  // tipos disponibles dentro del filtro, con cuántos elementos tiene cada uno
  const tipos = useMemo(() => {
    const all: { value: Tipo; label: string }[] = [
      { value: "clase", label: "Clases" },
      ...(rol !== "maestro" ? [{ value: "maestro" as Tipo, label: M().many }] : []),
      ...(rol === "admin" ? [{ value: "decano" as Tipo, label: D().many }] : []),
      { value: "carrera", label: "Carreras" }, { value: "grupo", label: "Grupos" }, { value: "equipo", label: "Equipos" },
      { value: "estudiante", label: "Estudiantes" },
    ];
    const count = (t: Tipo) => [...pool.values()].filter((g) => g.kind === t).length;
    return all.map((t) => ({ ...t, n: count(t.value) })).filter((t) => t.n > 0);
  }, [pool, rol]);
  const tipoOk: Tipo = tipos.some((t) => t.value === tipo) ? tipo : (tipos[0]?.value ?? "clase");

  // selección: ?add= en la URL tiene prioridad (enlaces desde Inicio o una clase)
  const [sel, setSelState] = useState<string[]>(() => {
    const fromUrl = params.get("add")?.split(",").filter(Boolean);
    return fromUrl?.length ? fromUrl : saved;
  });
  useEffect(() => { if (params.get("add")) setParams({}, { replace: true }); }, []); // eslint-disable-line
  const setSel = (s: string[]) => { setSelState(s); setSaved(s); };
  const valid = sel.filter((id) => pool.has(id));
  // la primera vez, algo para empezar (los 4 primeros del tipo elegido)
  useEffect(() => {
    if (valid.length || saved.length) return;
    const ids = [...pool.values()].filter((g) => g.kind === tipoOk).slice(0, 4).map((g) => g.id);
    if (ids.length > 1) setSelState(ids);
  }, []); // eslint-disable-line
  const toggle = (id: string) => setSel(valid.includes(id) ? valid.filter((x) => x !== id) : valid.length >= MAX ? valid : [...valid, id]);

  // lista del tipo elegido, con índice para decidir a simple vista
  const lista = useMemo(() => {
    const n = normText(q);
    const out = [...pool.values()].filter((g) => g.kind === tipoOk && (!n || normText(g.label + " " + (g.sub ?? "")).includes(n)))
      .map((g) => ({ g, idx: avgIndex(g.rows) }));
    return out.sort((a, b) => orden === "nombre" ? a.g.label.localeCompare(b.g.label, "es", { numeric: true }) : (b.idx ?? -1) - (a.idx ?? -1));
  }, [pool, tipoOk, q, orden]);
  const porIndice = [...lista].filter((x) => x.idx !== null).sort((a, b) => b.idx! - a.idx!);
  const others = valid.filter((id) => pool.get(id)?.kind !== tipoOk);   // lo elegido de otros tipos se conserva
  const pick = (ids: string[]) => setSel([...others, ...ids].slice(0, MAX));
  const nuevos = valid.filter((id) => pool.get(id)?.kind === tipoOk).length;

  const chosen = valid.map((id, i) => {
    const g = pool.get(id)!;
    return { ...g, color: SERIES_COLORS[i % SERIES_COLORS.length], vector: avgVector(g.rows, metrics), idx: avgIndex(g.rows), lv: levelCounts(g.rows) };
  });
  const sparse = sparseMetrics(allRows, metrics);
  const labels = hideSparse ? metrics.filter((m) => !sparse.has(m)) : metrics;
  const vecFor = (v: (number | null)[]) => labels.map((m) => v[metrics.indexOf(m)]);
  const series: Series[] = chosen.map((g) => ({ name: g.label, color: g.color, values: vecFor(g.vector) as number[], index: g.idx }));
  const tipoLabel = tipos.find((t) => t.value === tipoOk)?.label.toLowerCase() ?? "";

  if (!snapAll.clases.length) return <><PageHead title="Comparar" /><Empty icon="compare" title="No hay datos para comparar todavía" /></>;

  return (
    <>
      <PageHead title="Comparar" />

      <div className="step-h"><span className="step-n">1</span><b>¿Dentro de qué?</b><span className="muted small">Opcional. Por ejemplo, una clase para comparar a sus estudiantes o sus equipos.</span></div>
      <FilterBar summary={scoped ? <><b>{plural(rows.length, "estudiante", "estudiantes")}</b> de {allRows.length}</> : undefined} />

      <div className="cmp2">
        <aside className="card cmp-side">
          <div className="step-h in"><span className="step-n">2</span><b>¿Qué comparas?</b></div>
          <div className="tipo-grid">
            {tipos.map((t) => (
              <button key={t.value} className={"tipo" + (tipoOk === t.value ? " on" : "")} onClick={() => { setTipo(t.value); setQ(""); }}>
                <span>{t.label}</span><small>{t.n}</small>
              </button>
            ))}
          </div>
          <label className="search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${tipoLabel}…`} /></label>
          <div className="quick">
            {MAX - others.length >= 2 && <button onClick={() => pick(porIndice.slice(0, MAX - others.length).map((x) => x.g.id))}>{lista.length > MAX - others.length ? `Los ${MAX - others.length} primeros` : "Todos"}</button>}
            {porIndice.length > 5 && <button onClick={() => pick(porIndice.slice(0, 5).map((x) => x.g.id))}><Icon name="arrowUp" size={12} /> 5 mejores</button>}
            {porIndice.length > 5 && <button onClick={() => pick(porIndice.slice(-5).reverse().map((x) => x.g.id))}><Icon name="arrowDown" size={12} /> 5 más bajos</button>}
            {nuevos > 0 && <button onClick={() => pick([])}>Ninguno</button>}
            <span className="grow" />
            <button className="ord" onClick={() => setOrden(orden === "indice" ? "nombre" : "indice")} title="Cambiar orden">{orden === "indice" ? "Por índice" : "A–Z"}</button>
          </div>
          <div className="pick-list">
            {lista.map(({ g, idx }) => {
              const on = valid.includes(g.id), i = valid.indexOf(g.id);
              const c = on ? SERIES_COLORS[i % SERIES_COLORS.length] : undefined;
              const lv = levelOf(idx)?.id;
              return (
                <div key={g.id} className={"pick" + (on ? " on" : "")} style={{ ["--c" as string]: c ?? "transparent" }}>
                  <button className="pick-main" onClick={() => toggle(g.id)} disabled={!on && valid.length >= MAX} title={on ? "Quitar de la comparación" : "Añadir a la comparación"}>
                    <span className={"check" + (on ? " on" : "")} style={on ? { background: c, borderColor: c } : undefined}>{on && <Icon name="check" size={12} />}</span>
                    {g.kind === "maestro" || g.kind === "decano" || g.kind === "estudiante" ? <Avatar name={g.label} size={26} color={c} /> : null}
                    <span className="rank-txt"><b>{g.label}</b><small>{g.sub}</small></span>
                    <span className={"pick-idx " + (lv ?? "")}><i style={{ width: (idx ?? 0) + "%" }} />{fmt(idx)}</span>
                  </button>
                  {g.kind === "estudiante" && <button className="pick-open" onClick={() => openStudent(g.rows[0].r.id)} title="Ver perfil"><Icon name="eye" size={14} /></button>}
                </div>
              );
            })}
            {!lista.length && <p className="muted small pad-x">{q ? "Sin coincidencias." : "No hay elementos de este tipo dentro del filtro."}</p>}
          </div>
          <div className="refs">
            <span className="muted tiny">Referencia</span>
            {(["todos", "global"] as const).filter((id) => pool.has(id)).map((id) => (
              <button key={id} className={"pill btnish" + (valid.includes(id) ? " on" : "")} onClick={() => toggle(id)}>{valid.includes(id) ? "✓ " : "+ "}{pool.get(id)!.label}</button>
            ))}
          </div>
        </aside>

        <section className="cmp-right">
          {chosen.length === 0 ? (
            <div className="card pad cmp-empty">
              <Icon name="compare" size={30} />
              <h3>Marca a la izquierda lo que quieras comparar</h3>
              <p className="muted">Hasta {MAX} elementos de cualquier tipo. Puedes mezclar: una clase, un equipo y un estudiante.</p>
            </div>
          ) : <>
            <div className="sel-cards">
              {chosen.map((g) => (
                <div className="scard" key={g.id} style={{ ["--c" as string]: g.color }}>
                  <button className="scard-x" onClick={() => toggle(g.id)} aria-label={"Quitar " + g.label}><Icon name="close" size={12} /></button>
                  <div className="scard-h"><span className="dot" style={{ background: g.color }} /><b title={g.label}>{g.label}</b></div>
                  <div className="scard-v">{fmt(g.idx)}<small>{g.rows.length === 1 ? "estudiante" : `${g.rows.length} est.`}</small></div>
                  <LevelBar rows={g.rows as Row[]} />
                </div>
              ))}
              <div className="sel-meta"><span className="muted small">{chosen.length}/{MAX}</span>{chosen.length > 1 && <button className="link small" onClick={() => setSel([])}>Quitar todo</button>}</div>
            </div>
            <div className="card pad">
              <div className="card-h">
                <Segmented value={view} onChange={setView} options={[{ value: "radar", label: "Araña" }, { value: "barras", label: "Barras" }, { value: "tabla", label: "Tabla" }]} />
                <label className="switch-label"><input type="checkbox" className="switch" checked={hideSparse} onChange={(e) => setHideSparse(e.target.checked)} /> Ocultar competencias casi vacías</label>
              </div>
              {view === "radar" && <Radar labels={labels} series={series} invert={invert} onInvert={setInvert} size={600} title="comparacion" />}
              {view === "barras" && <MetricBars labels={labels} series={series} />}
              {view === "tabla" && <DiffTable labels={labels} chosen={chosen.map((g) => ({ label: g.label, color: g.color, values: vecFor(g.vector) }))} />}
            </div>
          </>}
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
