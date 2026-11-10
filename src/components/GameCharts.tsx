/* Gráficos del desempeño en el juego (informe igrades): tiempo invertido, Scorecard y puntajes. */
import { useMemo, useState, type CSSProperties } from "react";
import { fmt, displayName, type Row } from "../lib/metrics";
import { fmtMin, median, pearson } from "../lib/game";
import { SERIES_COLORS } from "../lib/groups";
import type { DesempenoEquipo } from "../lib/types";
import { Segmented } from "./ui";

export type EjeY = "indice" | "puntaje" | "bsc_acum";
const EJE: Record<EjeY, { label: string; corto: string; get(r: Row): number | null }> = {
  indice: { label: "Índice de competencias", corto: "índice", get: (r) => r.indice },
  puntaje: { label: "Puntaje del juego", corto: "puntaje", get: (r) => r.juego?.puntaje_ajustado ?? r.juego?.puntaje ?? null },
  bsc_acum: { label: "Scorecard acumulado del equipo", corto: "Scorecard", get: (r) => r.juego?.bsc_acum ?? null },
};
/* Un color distinto por equipo: la paleta de la app y, si hay más equipos que colores, tonos repartidos por ángulo áureo. */
export const teamColors = (equipos: string[]) => new Map([...new Set(equipos)].sort((a, b) => a.localeCompare(b, "es")).map((e, i) =>
  [e, i < SERIES_COLORS.length ? SERIES_COLORS[i] : `hsl(${Math.round((i * 137.508 + 20) % 360)} 70% 58%)`]));
const eqDe = (r: Row) => r.juego?.equipo || r.equipo || "—";
const sameEq = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/* Perfil del estudiante según dónde cae frente a las medianas de la clase (tiempo × competencias) */
const PERFILES = ["Eficiente", "Comprometido", "Tiempo sin resultado", "Poca participación"] as const;
const PERFIL_CLS = ["good", "good", "warn", "bad"];
function perfiles(rows: Row[]) {
  const ok = rows.filter((r) => r.juego?.minutos != null && r.indice != null);
  const mx = median(ok.map((r) => r.juego!.minutos!)), my = median(ok.map((r) => r.indice!));
  return (r: Row) => (mx === null || my === null || r.juego?.minutos == null || r.indice == null) ? -1
    : r.juego.minutos >= mx ? (r.indice >= my ? 1 : 2) : r.indice >= my ? 0 : 3;
}

/* ---------- Dispersión: tiempo invertido vs. resultado, con cuadrantes ---------- */
export function TimeScatter({ rows, onPick, colors: colorsIn, focus, onFocus }: {
  rows: Row[]; onPick(r: Row): void; colors?: Map<string, string>; focus?: string | null; onFocus?(e: string | null): void;
}) {
  // sin informe de competencias todavía, se empieza por lo que sí hay
  const [eje, setEje] = useState<EjeY>(() => rows.some((r) => r.indice !== null) ? "indice" : rows.some((r) => r.juego?.bsc_acum != null) ? "bsc_acum" : "puntaje");
  const [hover, setHover] = useState<Row | null>(null);
  const pts = rows.filter((r) => r.juego?.minutos !== null && r.juego?.minutos !== undefined && EJE[eje].get(r) !== null);
  const own = useMemo(() => teamColors(rows.map(eqDe)), [rows]);
  const colors = colorsIn ?? own;
  const porEq = useMemo(() => { const m = new Map<string, number>(); rows.forEach((r) => m.set(eqDe(r), (m.get(eqDe(r)) ?? 0) + 1)); return m; }, [rows]);
  if (!pts.length) return <p className="muted small">No hay estudiantes con tiempo y {EJE[eje].corto} a la vez.</p>;

  const W = 640, H = 380, L = 52, B = 40, T = 16, Rr = 16;
  const xs = pts.map((r) => r.juego!.minutos!), ys = pts.map((r) => EJE[eje].get(r)!);
  const xMax = Math.max(60, ...xs) * 1.05;
  const yMax = eje === "bsc_acum" ? Math.max(10, ...ys) * 1.1 : 100;
  const X = (v: number) => L + (v / xMax) * (W - L - Rr), Y = (v: number) => H - B - (v / yMax) * (H - B - T);
  const mx = median(xs)!, my = median(ys)!;
  const r = pearson(pts.map((p) => [p.juego!.minutos!, EJE[eje].get(p)!]));
  const relacion = r === null ? null : Math.abs(r) < 0.2 ? "casi ninguna" : `${Math.abs(r) < 0.5 ? "moderada" : "fuerte"} ${r > 0 ? "positiva" : "negativa"}`;
  const ticksX = Array.from({ length: 5 }, (_, i) => (xMax / 4) * i);
  const ticksY = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);
  const q = (x: number, y: number) => (x >= mx ? (y >= my ? 1 : 2) : y >= my ? 0 : 3);
  const cuenta = [0, 0, 0, 0]; pts.forEach((p) => cuenta[q(p.juego!.minutos!, EJE[eje].get(p)!)]++);
  const nombres = ["Eficientes", "Comprometidos", "Mucho tiempo, bajo resultado", "Poca participación"];
  const dim = (p: Row) => !!focus && !sameEq(eqDe(p), focus);
  // los del equipo enfocado se dibujan encima
  const orden = focus ? [...pts].sort((a, b) => Number(!dim(a)) - Number(!dim(b))) : pts;

  return (
    <div className="tscatter">
      <div className="card-h">
        <Segmented size="sm" value={eje} onChange={setEje} options={[{ value: "indice", label: "Competencias" }, { value: "puntaje", label: "Puntaje" }, { value: "bsc_acum", label: "Scorecard" }]} />
        {relacion && <span className="muted small">Relación tiempo–{EJE[eje].corto}: <b>{relacion}</b> (r = {r!.toFixed(2)})</span>}
      </div>
      <div className="tscatter-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tiempo invertido frente a ${EJE[eje].label}`}>
          <rect x={X(mx)} y={T} width={W - Rr - X(mx)} height={Y(my) - T} className="qz q1" />
          <rect x={L} y={T} width={X(mx) - L} height={Y(my) - T} className="qz q0" />
          <rect x={X(mx)} y={Y(my)} width={W - Rr - X(mx)} height={H - B - Y(my)} className="qz q2" />
          <rect x={L} y={Y(my)} width={X(mx) - L} height={H - B - Y(my)} className="qz q3" />
          {ticksY.map((v) => <g key={"y" + v}><line x1={L} x2={W - Rr} y1={Y(v)} y2={Y(v)} className="gl" /><text x={L - 8} y={Y(v) + 4} className="tk" textAnchor="end">{Math.round(v)}</text></g>)}
          {ticksX.map((v, i) => <text key={"x" + v} x={X(v)} y={H - B + 18} className="tk" textAnchor={i === 0 ? "start" : i === ticksX.length - 1 ? "end" : "middle"}>{fmtMin(v)}</text>)}
          <line x1={X(mx)} x2={X(mx)} y1={T} y2={H - B} className="med" />
          <line x1={L} x2={W - Rr} y1={Y(my)} y2={Y(my)} className="med" />
          <text x={L + 6} y={T + 14} className="ql">{nombres[0]} · {cuenta[0]}</text>
          <text x={W - Rr - 6} y={T + 14} className="ql" textAnchor="end">{nombres[1]} · {cuenta[1]}</text>
          <text x={W - Rr - 6} y={H - B - 8} className="ql warn" textAnchor="end">{nombres[2]} · {cuenta[2]}</text>
          <text x={L + 6} y={H - B - 8} className="ql">{nombres[3]} · {cuenta[3]}</text>
          <text x={(L + W - Rr) / 2} y={H - 4} className="ax" textAnchor="middle">Tiempo invertido en el juego →</text>
          <text x={14} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{EJE[eje].label} →</text>
          {orden.map((p) => (
            <circle key={p.r.id} cx={X(p.juego!.minutos!)} cy={Y(EJE[eje].get(p)!)} r={hover === p ? 8 : focus && !dim(p) ? 7 : 6} fill={colors.get(eqDe(p))}
              className={"dot-pt" + (dim(p) ? " dim" : "")}
              onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onPick(p)}><title>{displayName(p.r.nombre)}</title></circle>
          ))}
        </svg>
        {hover && (
          <div className="ts-tip" style={{ left: `${(X(hover.juego!.minutos!) / W) * 100}%`, top: `${(Y(EJE[eje].get(hover)!) / H) * 100}%` }}>
            <b>{displayName(hover.r.nombre)}</b><span>{eqDe(hover)}</span>
            <span>{fmtMin(hover.juego!.minutos)} · {EJE[eje].corto} {fmt(EJE[eje].get(hover))}</span>
          </div>
        )}
      </div>
      <div className="team-chips" role="group" aria-label="Resaltar un equipo">
        {[...colors.entries()].filter(([e]) => porEq.has(e)).map(([e, c]) => {
          const on = !!focus && sameEq(focus, e);
          return (
            <button key={e} type="button" className={"tchip" + (on ? " on" : focus ? " off" : "")} style={{ "--c": c } as CSSProperties}
              onClick={() => onFocus?.(on ? null : e)} disabled={!onFocus} aria-pressed={on}>
              <span className="dot" />{e}<small>{porEq.get(e)}</small>
            </button>
          );
        })}
        {focus && onFocus && <button type="button" className="link small" onClick={() => onFocus(null)}>Ver todos</button>}
      </div>
      <p className="muted tiny">Las líneas punteadas son la mediana de la clase. {onFocus ? "Toca un equipo para resaltarlo y un punto para abrir la ficha del estudiante." : "Toca un punto para abrir la ficha del estudiante."}</p>
    </div>
  );
}

/* ---------- Tablero de equipos: Scorecard, tiempo, percentil; cada fila se abre con sus integrantes ---------- */
export function TeamBoard({ equipos, rows = [], colors: colorsIn, focus, onFocus, onPick }: {
  equipos: DesempenoEquipo[]; rows?: Row[]; colors?: Map<string, string>; focus?: string | null; onFocus?(e: string | null): void; onPick?(r: Row): void;
}) {
  const lista = [...equipos].sort((a, b) => (b.bsc_acum ?? -1) - (a.bsc_acum ?? -1));
  const maxB = Math.max(1, ...lista.map((e) => Math.max(e.bsc_acum ?? 0, e.bsc ?? 0)));
  const miembros = (e: string) => rows.filter((r) => sameEq(eqDe(r), e)).sort((a, b) => (b.juego?.minutos ?? -1) - (a.juego?.minutos ?? -1));
  const porPersona = (e: DesempenoEquipo) => { const n = miembros(e.equipo).length; return e.minutos !== null && n ? e.minutos / n : null; };
  const maxM = Math.max(1, ...lista.map((e) => porPersona(e) ?? e.minutos ?? 0));
  const maxMin = Math.max(1, ...rows.map((r) => r.juego?.minutos ?? 0));
  const colors = colorsIn ?? teamColors(equipos.map((e) => e.equipo));
  const conPersonas = rows.length > 0;
  return (
    <div className="tboard">
      <div className="tb-row tb-h">
        <span>Equipo</span><span>Scorecard acumulado <i className="mk" /> último trimestre</span>
        <span>{conPersonas ? "Tiempo por integrante" : "Tiempo total"}</span><span className="num">Percentil</span><span className="num">Puntaje</span>
      </div>
      {lista.map((e, i) => {
        const open = !!focus && sameEq(focus, e.equipo);
        const ms = open ? miembros(e.equipo) : [];
        const tpp = conPersonas ? porPersona(e) : e.minutos;
        const tend = e.bsc !== null && e.bsc_acum !== null ? (e.bsc >= e.bsc_acum ? "up" : "down") : null;
        return (
          <div key={e.equipo} className={"tb-item" + (open ? " open" : "") + (focus && !open ? " faded" : "")}>
            <button type="button" className="tb-row tb-btn" onClick={() => onFocus?.(open ? null : e.equipo)} aria-expanded={open} disabled={!onFocus}>
              <span className="tb-n"><b>{i + 1}</b><span className="dot" style={{ background: colors.get(e.equipo) }} /><span className="tb-name">{e.equipo}</span>
                {conPersonas && <small className="muted">{miembros(e.equipo).length}</small>}</span>
              <span className="tb-bar" title={`Acumulado ${fmt(e.bsc_acum)} · último trimestre ${fmt(e.bsc)}`}>
                <i style={{ width: ((e.bsc_acum ?? 0) / maxB) * 100 + "%", background: colors.get(e.equipo) }} />
                {e.bsc !== null && <em style={{ left: ((e.bsc ?? 0) / maxB) * 100 + "%" }} />}
                <small>{fmt(e.bsc_acum)}{tend && <span className={"tend " + tend}>{tend === "up" ? "▲" : "▼"}</span>}</small>
              </span>
              <span className="tb-bar time" title={`Total del equipo ${fmtMin(e.minutos)}`}><i style={{ width: ((tpp ?? 0) / maxM) * 100 + "%" }} /><small>{fmtMin(tpp)}</small></span>
              <span className="num">{e.percentil !== null ? <span className={"chip" + ((e.percentil ?? 0) >= 66 ? " alto" : (e.percentil ?? 0) < 34 ? " bajo" : "")}>{Math.round(e.percentil!)}</span> : <span className="muted">n/A</span>}</span>
              <span className="num"><b>{e.puntaje !== null ? fmt(e.puntaje) : "—"}</b></span>
            </button>
            {open && (
              <div className="tb-members">
                {ms.length === 0 && <p className="muted small">Ningún estudiante de esta clase quedó enlazado a este equipo.</p>}
                {ms.map((r) => (
                  <button type="button" key={r.r.id} className="tbm" onClick={() => onPick?.(r)}>
                    <span className="tbm-n">{displayName(r.r.nombre)}</span>
                    <span className="tb-bar time"><i style={{ width: ((r.juego?.minutos ?? 0) / maxMin) * 100 + "%", background: colors.get(e.equipo), opacity: .7 }} /><small>{fmtMin(r.juego?.minutos ?? null)}</small></span>
                    <span className="num"><small className="muted">puntaje</small> <b>{fmt(r.juego?.puntaje_ajustado ?? r.juego?.puntaje ?? null)}</b></span>
                    <span className="num"><small className="muted">índice</small> <b>{fmt(r.indice)}</b></span>
                  </button>
                ))}
                <p className="muted tiny">Total del equipo: {fmtMin(e.minutos)}{e.trimestres ? ` · ${e.trimestres} trimestres` : ""}. Toca un integrante para abrir su ficha.</p>
              </div>
            )}
          </div>
        );
      })}
      <p className="muted tiny">Ordenados por Scorecard acumulado. ▲/▼ = el último trimestre quedó por encima o por debajo del acumulado. Percentil frente a todos los equipos del simulador («n/A» = aún no completó los trimestres necesarios).{onFocus ? " Toca un equipo para ver sus integrantes." : ""}</p>
    </div>
  );
}

/* ---------- Tabla por estudiante: tiempo, puntaje, Scorecard, competencias y perfil ---------- */
type ColJ = "nombre" | "equipo" | "minutos" | "puntaje" | "bsc" | "indice";
export function StudentGameTable({ rows, colors, focus, onPick }: { rows: Row[]; colors: Map<string, string>; focus?: string | null; onPick(r: Row): void }) {
  const [sort, setSort] = useState<{ k: ColJ; asc: boolean }>({ k: "minutos", asc: false });
  const [q, setQ] = useState("");
  const perfil = useMemo(() => perfiles(rows), [rows]);
  const val = (r: Row, k: ColJ): number | string | null => k === "nombre" ? displayName(r.r.nombre) : k === "equipo" ? eqDe(r)
    : k === "minutos" ? r.juego?.minutos ?? null : k === "puntaje" ? r.juego?.puntaje_ajustado ?? r.juego?.puntaje ?? null
    : k === "bsc" ? r.juego?.bsc_acum ?? null : r.indice;
  const pm = median(rows.map((r) => r.juego?.minutos).filter((x): x is number => typeof x === "number"));
  const maxMin = Math.max(1, ...rows.map((r) => r.juego?.minutos ?? 0));
  const nq = q.trim().toLowerCase();
  const lista = rows.filter((r) => (!focus || sameEq(eqDe(r), focus)) && (!nq || displayName(r.r.nombre).toLowerCase().includes(nq) || eqDe(r).toLowerCase().includes(nq)))
    .sort((a, b) => {
      const x = val(a, sort.k), y = val(b, sort.k);
      if (x === null) return 1; if (y === null) return -1;
      const c = typeof x === "string" ? x.localeCompare(String(y), "es") : x - (y as number);
      return sort.asc ? c : -c;
    });
  const th = (k: ColJ, label: string, cls = "") => (
    <th className={cls}><button type="button" className={"th-sort" + (sort.k === k ? " on" : "")} onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : k === "nombre" || k === "equipo" }))}>
      {label}{sort.k === k && <span>{sort.asc ? " ↑" : " ↓"}</span>}</button></th>);
  return (
    <div className="sgtable">
      <div className="sgt-tools">
        <input className="sgt-search" placeholder="Buscar estudiante o equipo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{lista.length} de {rows.length}{focus ? ` · equipo ${focus}` : ""} · tiempo mediano {fmtMin(pm)}</span>
      </div>
      <div className="table-scroll sgt-scroll">
        <table className="etable sgt">
          <thead><tr>{th("nombre", "Estudiante")}{th("minutos", "Tiempo en el juego")}{th("puntaje", "Puntaje", "num")}{th("bsc", "Scorecard eq.", "num")}{th("indice", "Competencias", "num")}<th>Perfil</th></tr></thead>
          <tbody>
            {lista.map((r) => {
              const m = r.juego?.minutos ?? null, p = perfil(r);
              const dif = m !== null && pm ? Math.round(((m - pm) / pm) * 100) : null;
              return (
                <tr key={r.r.id} onClick={() => onPick(r)} className="">
                  <td><b>{displayName(r.r.nombre)}</b><span className="eq-cell"><span className="dot" style={{ background: colors.get(eqDe(r)) }} />{eqDe(r)}</span></td>
                  <td><div className="t-cell">
                    <span className="tb-bar time slim"><i style={{ width: ((m ?? 0) / maxMin) * 100 + "%" }} />{pm && <em className="avg" style={{ left: (pm / maxMin) * 100 + "%" }} />}</span><b className="tval">{fmtMin(m)}</b>
                    {dif !== null && <span className={"dif " + (dif >= 0 ? "pos" : "neg")}>{dif >= 0 ? "+" : ""}{dif}%</span>}</div>
                  </td>
                  <td className="num">{fmt(val(r, "puntaje") as number | null)}</td>
                  <td className="num">{fmt(val(r, "bsc") as number | null)}</td>
                  <td className="num"><b>{fmt(r.indice)}</b></td>
                  <td>{p >= 0 ? <span className={"pf " + PERFIL_CLS[p]}>{PERFILES[p as 0 | 1 | 2 | 3]}</span> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted tiny">La raya en la barra de tiempo es la mediana de la clase; el % es la diferencia con esa mediana. El perfil compara tiempo y competencias con las medianas de la clase (las líneas punteadas del gráfico). Toca una fila para abrir la ficha.</p>
    </div>
  );
}

/* ---------- Panel completo de la clase: dispersión + Equipos / Estudiantes con resaltado compartido ---------- */
export function GamePanel({ rows, equipos, onPick }: { rows: Row[]; equipos: DesempenoEquipo[]; onPick(r: Row): void }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [vista, setVista] = useState<"equipos" | "estudiantes">(equipos.length ? "equipos" : "estudiantes");
  const colors = useMemo(() => teamColors([...equipos.map((e) => e.equipo), ...rows.map(eqDe)]), [equipos, rows]);
  const conT = rows.filter((r) => r.juego?.minutos != null);
  return (
    <>
      {conT.length > 0 && <><h4 className="sub-h">Tiempo invertido vs. resultado</h4><TimeScatter rows={conT} onPick={onPick} colors={colors} focus={focus} onFocus={setFocus} /></>}
      <div className="card-h game-tabs">
        <Segmented size="sm" value={vista} onChange={setVista} options={[
          ...(equipos.length ? [{ value: "equipos" as const, label: `Equipos · ${equipos.length}` }] : []),
          { value: "estudiantes" as const, label: `Estudiantes · ${rows.length}` }]} />
        {focus && <span className="muted small">Resaltado: <b>{focus}</b> · <button type="button" className="link small" onClick={() => setFocus(null)}>quitar</button></span>}
      </div>
      {vista === "equipos" && equipos.length > 0
        ? <TeamBoard equipos={equipos} rows={rows} colors={colors} focus={focus} onFocus={setFocus} onPick={onPick} />
        : <StudentGameTable rows={rows} colors={colors} focus={focus} onPick={onPick} />}
    </>
  );
}

/* ---------- Tarjeta del estudiante: escrita para él ---------- */
export function StudentGame({ row, classRows }: { row: Row; classRows: Row[] }) {
  const j = row.juego!;
  const conT = classRows.filter((r) => r.juego?.minutos !== null && r.juego?.minutos !== undefined);
  const prom = conT.length ? conT.reduce((a, r) => a + r.juego!.minutos!, 0) / conT.length : null;
  const eq = conT.filter((r) => (r.juego!.equipo || "") === j.equipo);
  const promEq = eq.length ? eq.reduce((a, r) => a + r.juego!.minutos!, 0) / eq.length : null;
  const dif = prom && j.minutos !== null ? ((j.minutos - prom) / prom) * 100 : null;
  const max = Math.max(1, j.minutos ?? 0, prom ?? 0, promEq ?? 0);
  const puesto = conT.length ? [...conT].sort((a, b) => b.juego!.minutos! - a.juego!.minutos!).findIndex((r) => r === row) + 1 : 0;
  const frase = j.minutos === null ? "Aún no hay registro de tu tiempo en el juego."
    : dif === null ? `Dedicaste ${fmtMin(j.minutos)} al juego.`
    : Math.abs(dif) < 10 ? `Dedicaste ${fmtMin(j.minutos)}, en línea con el promedio de tu clase.`
    : `Dedicaste ${fmtMin(j.minutos)}, un ${Math.abs(Math.round(dif))}% ${dif > 0 ? "más" : "menos"} que el promedio de tu clase.`;
  const barra = (label: string, v: number | null, cls = "") => (
    <div className="sg-bar"><span>{label}</span><span className="sg-track"><i className={cls} style={{ width: ((v ?? 0) / max) * 100 + "%" }} /></span><b>{fmtMin(v)}</b></div>);
  return (
    <div className="card pad sgame">
      <h3>Desempeño en el juego</h3>
      <p className="sg-frase">{frase}{puesto ? ` Eres el ${puesto}.º de ${conT.length} en tiempo dedicado.` : ""}</p>
      <div className="sg-bars">
        {barra("Tú", j.minutos, "me")}
        {barra(`Promedio de tu equipo (${j.equipo || "—"})`, promEq)}
        {barra("Promedio de la clase", prom)}
      </div>
      {j.tiempos && j.tiempos.length > 0 && <TrimestreBars mine={j.tiempos} classRows={classRows} />}
      <div className="sg-kpis">
        <div><small>Puntaje del juego</small><b>{fmt(j.puntaje_ajustado ?? j.puntaje)}</b>{j.puntaje_ajustado !== null && j.puntaje !== null && j.puntaje_ajustado !== j.puntaje && <em>automático {fmt(j.puntaje)}</em>}</div>
        <div><small>Scorecard acumulado del equipo</small><b>{fmt(j.bsc_acum)}</b></div>
        <div><small>Scorecard del último trimestre</small><b>{fmt(j.bsc)}</b>{j.bsc_acum !== null && j.bsc !== null && <em className={j.bsc >= j.bsc_acum ? "pos" : "neg"}>{j.bsc >= j.bsc_acum ? "▲ mejorando" : "▼ por debajo del acumulado"}</em>}</div>
        <div><small>Trimestres jugados</small><b>{j.trimestres ?? "—"}</b></div>
      </div>
    </div>
  );
}

/* Tiempo de cada trimestre: el del estudiante frente al promedio de la clase, y lo acumulado */
function TrimestreBars({ mine, classRows }: { mine: number[]; classRows: Row[] }) {
  const n = mine.length;
  const prom = Array.from({ length: n }, (_, k) => {
    const v = classRows.map((r) => r.juego?.tiempos?.[k]).filter((x): x is number => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
  const jugados = Math.max(...mine.map((v, k) => (v > 0 || (prom[k] ?? 0) > 0 ? k + 1 : 0)));
  const max = Math.max(1, ...mine, ...prom.map((v) => v ?? 0));
  let acum = 0;
  return (
    <div className="sg-trim">
      <h4 className="sub-h">Tiempo por trimestre</h4>
      <div className="trim-cols">
        {mine.slice(0, Math.max(1, jugados)).map((v, k) => {
          acum += v;
          return (
            <div className="trim" key={k} title={`Trimestre ${k + 1}: tú ${fmtMin(v)} · promedio de la clase ${fmtMin(prom[k])}`}>
              <div className="trim-bars">
                <i className="me" style={{ height: (v / max) * 100 + "%" }} />
                <i style={{ height: ((prom[k] ?? 0) / max) * 100 + "%" }} />
              </div>
              <b>{fmtMin(v)}</b><small>T{k + 1} · acum. {fmtMin(acum)}</small>
            </div>
          );
        })}
      </div>
      <p className="muted tiny"><span className="dot" style={{ background: "var(--accent)" }} /> Tú · <span className="dot" style={{ background: "var(--fill-3)" }} /> promedio de la clase</p>
    </div>
  );
}

/* ---------- Comparar: tiempo, puntaje y Scorecard entre series ---------- */
export function GameBars({ series }: { series: { name: string; color: string; rows: Row[] }[] }) {
  const avg = (rr: Row[], f: (r: Row) => number | null | undefined) => { const v = rr.map(f).filter((x): x is number => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const datos = series.map((s) => ({ ...s, min: avg(s.rows, (r) => r.juego?.minutos), pun: avg(s.rows, (r) => r.juego?.puntaje_ajustado ?? r.juego?.puntaje), bsc: avg(s.rows, (r) => r.juego?.bsc_acum), n: s.rows.filter((r) => r.juego).length }));
  if (!datos.some((d) => d.n)) return <p className="muted">Ninguno de los elementos elegidos tiene desempeño del juego importado (informe «igrades»).</p>;
  const bloque = (titulo: string, k: "min" | "pun" | "bsc", f: (v: number | null) => string) => {
    const max = Math.max(1, ...datos.map((d) => d[k] ?? 0));
    return (
      <div className="gb-block"><h4 className="sub-h">{titulo}</h4>
        {datos.map((d) => (
          <div className="mbar-row" key={d.name}><div className="mbar-lab">{d.name}</div>
            <div className="mbar-tracks"><div className="mbar-track"><span style={{ width: ((d[k] ?? 0) / max) * 100 + "%", background: d.color }} /><em className="wide">{f(d[k])}</em></div></div></div>
        ))}
      </div>
    );
  };
  return (
    <div className="gbars">
      {bloque("Tiempo promedio por estudiante", "min", fmtMin)}
      {bloque("Puntaje promedio del juego", "pun", (v) => fmt(v))}
      {bloque("Scorecard acumulado promedio", "bsc", (v) => fmt(v))}
      <p className="muted tiny">Solo cuentan los estudiantes con desempeño importado: {datos.map((d) => `${d.name} ${d.n}`).join(" · ")}.</p>
    </div>
  );
}
