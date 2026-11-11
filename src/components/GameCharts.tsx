/* Gráficos del desempeño en el juego (informe igrades): tiempo invertido y Scorecard acumulado.
   Puntaje, percentil y Scorecard del último trimestre se importan pero no se muestran: dependen de la dificultad configurada. */
import { useMemo, useState, type CSSProperties } from "react";
import { fmt, displayName, plural, type Row } from "../lib/metrics";
import { fmtMin, median, nTrim, pearson, promedioQ, ultimoT, valoresQ, type SerieQ } from "../lib/game";
import { SERIES_COLORS } from "../lib/groups";
import type { Desempeno, DesempenoEquipo } from "../lib/types";
import type { Incompleto } from "../data/store";
import { Icon, Segmented } from "./ui";

export type EjeY = "indice" | "bsc_acum";
const EJE: Record<EjeY, { label: string; corto: string; get(r: Row): number | null }> = {
  indice: { label: "Índice de competencias", corto: "índice", get: (r) => r.indice },
  bsc_acum: { label: "Scorecard acumulado del equipo", corto: "Scorecard", get: (r) => r.juego?.bsc_acum ?? null },
};
/* Un color distinto por equipo: la paleta de la app y, si hay más equipos que colores, tonos repartidos por ángulo áureo. */
export const teamColors = (equipos: string[]) => new Map([...new Set(equipos)].sort((a, b) => a.localeCompare(b, "es")).map((e, i) =>
  [e, i < SERIES_COLORS.length ? SERIES_COLORS[i] : `hsl(${Math.round((i * 137.508 + 20) % 360)} 70% 58%)`]));
const eqDe = (r: Row) => r.juego?.equipo || r.equipo || "—";
const sameEq = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
/** Juego individual: cada equipo (empresa) tiene un solo estudiante, así que «equipo» y «estudiante» son lo mismo */
export function esIndividual(rows: Row[]) {
  const n = new Map<string, number>();
  rows.forEach((r) => { const k = eqDe(r).trim().toUpperCase(); n.set(k, (n.get(k) ?? 0) + 1); });
  return rows.length > 0 && [...n.values()].every((c) => c <= 1);
}

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
export function TimeScatter({ rows, onPick, colors: colorsIn, focus, onFocus, individual }: {
  rows: Row[]; onPick(r: Row): void; colors?: Map<string, string>; focus?: string | null; onFocus?(e: string | null): void; individual?: boolean;
}) {
  // sin informe de competencias todavía, se empieza por lo que sí hay
  const [eje, setEje] = useState<EjeY>(() => (rows.some((r) => r.indice !== null) ? "indice" : "bsc_acum"));
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
        {rows.some((r) => r.indice !== null)
          ? <Segmented size="sm" value={eje} onChange={setEje} options={[{ value: "indice", label: "Competencias" }, { value: "bsc_acum", label: "Scorecard" }]} />
          : <span className="muted small">Eje vertical: <b>Scorecard acumulado</b></span>}
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
          <text x={14} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{eje === "bsc_acum" && individual ? "Scorecard acumulado" : EJE[eje].label} →</text>
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
      {!individual && <div className="team-chips" role="group" aria-label="Resaltar un equipo">
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
      </div>}
      <p className="muted tiny">Las líneas punteadas son la mediana de la clase. {onFocus && !individual ? "Toca un equipo para resaltarlo y un punto para abrir la ficha del estudiante." : "Toca un punto para abrir la ficha del estudiante."}</p>
    </div>
  );
}

/* ---------- Tablero de equipos: Scorecard acumulado y tiempo; cada fila se abre con sus integrantes ---------- */
export function TeamBoard({ equipos, rows = [], colors: colorsIn, focus, onFocus, onPick }: {
  equipos: DesempenoEquipo[]; rows?: Row[]; colors?: Map<string, string>; focus?: string | null; onFocus?(e: string | null): void; onPick?(r: Row): void;
}) {
  const lista = [...equipos].sort((a, b) => (b.bsc_acum ?? -1) - (a.bsc_acum ?? -1));
  const maxB = Math.max(1, ...lista.map((e) => e.bsc_acum ?? 0));
  const miembros = (e: string) => rows.filter((r) => sameEq(eqDe(r), e)).sort((a, b) => (b.juego?.minutos ?? -1) - (a.juego?.minutos ?? -1));
  const porPersona = (e: DesempenoEquipo) => { const n = miembros(e.equipo).length; return e.minutos !== null && n ? e.minutos / n : null; };
  const maxM = Math.max(1, ...lista.map((e) => porPersona(e) ?? e.minutos ?? 0));
  const maxMin = Math.max(1, ...rows.map((r) => r.juego?.minutos ?? 0));
  const colors = colorsIn ?? teamColors(equipos.map((e) => e.equipo));
  const conPersonas = rows.length > 0;
  const conComp = rows.some((r) => r.indice !== null);
  return (
    <div className="tboard">
      <div className="tb-row tb-h">
        <span>Equipo</span><span>Scorecard acumulado</span><span>{conPersonas ? "Tiempo por integrante" : "Tiempo total"}</span>
      </div>
      {lista.map((e, i) => {
        const open = !!focus && sameEq(focus, e.equipo);
        const ms = open ? miembros(e.equipo) : [];
        const tpp = conPersonas ? porPersona(e) : e.minutos;
        return (
          <div key={e.equipo} className={"tb-item" + (open ? " open" : "") + (focus && !open ? " faded" : "")}>
            <button type="button" className="tb-row tb-btn" onClick={() => onFocus?.(open ? null : e.equipo)} aria-expanded={open} disabled={!onFocus}>
              <span className="tb-n"><b>{i + 1}</b><span className="dot" style={{ background: colors.get(e.equipo) }} /><span className="tb-name">{e.equipo}</span>
                {conPersonas && <small className="muted">{miembros(e.equipo).length}</small>}</span>
              <span className="tb-bar" title={`Scorecard acumulado ${fmt(e.bsc_acum)}`}>
                <i style={{ width: ((e.bsc_acum ?? 0) / maxB) * 100 + "%", background: colors.get(e.equipo) }} /><small>{fmt(e.bsc_acum)}</small>
              </span>
              <span className="tb-bar time" title={`Total del equipo ${fmtMin(e.minutos)}`}><i style={{ width: ((tpp ?? 0) / maxM) * 100 + "%" }} /><small>{fmtMin(tpp)}</small></span>
            </button>
            {open && (
              <div className="tb-members">
                {ms.length === 0 && <p className="muted small">Ningún estudiante de esta clase quedó enlazado a este equipo.</p>}
                {ms.map((r) => (
                  <button type="button" key={r.r.id} className="tbm" onClick={() => onPick?.(r)}>
                    <span className="tbm-n">{displayName(r.r.nombre)}</span>
                    <span className="tb-bar time"><i style={{ width: ((r.juego?.minutos ?? 0) / maxMin) * 100 + "%", background: colors.get(e.equipo), opacity: .7 }} /><small>{fmtMin(r.juego?.minutos ?? null)}</small></span>
                    {conComp ? <span className="num"><small className="muted">competencias</small> <b>{fmt(r.indice)}</b></span> : <span />}
                  </button>
                ))}
                <p className="muted tiny">Total del equipo: {fmtMin(e.minutos)}{e.trimestres ? ` · ${e.trimestres} trimestres` : ""}. Toca un integrante para abrir su ficha.</p>
              </div>
            )}
          </div>
        );
      })}
      <p className="muted tiny">Ordenados por Scorecard acumulado.{onFocus ? " Toca un equipo para ver sus integrantes." : ""}</p>
    </div>
  );
}

/* ---------- Tabla por estudiante: tiempo, puntaje, Scorecard, competencias y perfil ---------- */
type ColJ = "nombre" | "equipo" | "minutos" | "bsc" | "indice";
export function StudentGameTable({ rows, colors, focus, onPick }: { rows: Row[]; colors: Map<string, string>; focus?: string | null; onPick(r: Row): void }) {
  const [sort, setSort] = useState<{ k: ColJ; asc: boolean }>({ k: "minutos", asc: false });
  const [q, setQ] = useState("");
  const perfil = useMemo(() => perfiles(rows), [rows]);
  const conComp = rows.some((r) => r.indice !== null);
  const val = (r: Row, k: ColJ): number | string | null => k === "nombre" ? displayName(r.r.nombre) : k === "equipo" ? eqDe(r)
    : k === "minutos" ? r.juego?.minutos ?? null
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
          <thead><tr>{th("nombre", "Estudiante")}{th("minutos", "Tiempo en el juego")}{th("bsc", "Scorecard acumulado", "num")}{conComp && <>{th("indice", "Competencias", "num")}<th>Perfil</th></>}</tr></thead>
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
                  <td className="num">{fmt(val(r, "bsc") as number | null)}</td>
                  {conComp && <><td className="num"><b>{fmt(r.indice)}</b></td>
                  <td>{p >= 0 ? <span className={"pf " + PERFIL_CLS[p]}>{PERFILES[p as 0 | 1 | 2 | 3]}</span> : <span className="muted">—</span>}</td></>}
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
  const individual = esIndividual(rows);
  const [vista, setVista] = useState<"equipos" | "estudiantes" | "trimestres">(equipos.length && !individual ? "equipos" : "estudiantes");
  const nq = nTrim(equipos);
  const hayEvolucion = equipos.some((e) => (["bsc_acum", "tiempo"] as SerieQ[]).some((k) => valoresQ(e, k, nq).filter((v) => v !== null).length >= 2));
  const pestanas = [
    ...(equipos.length && !individual ? [{ value: "equipos" as const, label: `Equipos · ${equipos.length}` }] : []),
    { value: "estudiantes" as const, label: `Estudiantes · ${rows.length}` },
    ...(hayEvolucion ? [{ value: "trimestres" as const, label: `Trimestres · ${nq}` }] : [])];
  // juego individual: un solo color (el equipo no agrupa a nadie) y el nombre del estudiante en lugar del de la empresa
  const colors = useMemo(() => individual ? new Map([...equipos.map((e) => e.equipo), ...rows.map(eqDe)].map((e) => [e, "var(--accent)"]))
    : teamColors([...equipos.map((e) => e.equipo), ...rows.map(eqDe)]), [equipos, rows, individual]);
  const nombres = useMemo(() => individual ? new Map(rows.map((r) => [eqDe(r).trim().toUpperCase(), displayName(r.r.nombre)])) : undefined, [rows, individual]);
  const conT = rows.filter((r) => r.juego?.minutos != null);
  return (
    <>
      {conT.length > 0 && <><h4 className="sub-h">Tiempo invertido vs. resultado</h4><TimeScatter rows={conT} onPick={onPick} colors={colors} focus={focus} onFocus={setFocus} individual={individual} /></>}
      <div className="card-h game-tabs">
        {pestanas.length > 1 ? <Segmented size="sm" value={vista} onChange={setVista} options={pestanas} /> : <h4 className="sub-h">{pestanas[0].label}</h4>}
        {focus && <span className="muted small">Resaltado: <b>{nombres?.get(focus.trim().toUpperCase()) ?? focus}</b> · <button type="button" className="link small" onClick={() => setFocus(null)}>quitar</button></span>}
      </div>
      {vista === "trimestres" && hayEvolucion ? <QuarterPanel equipos={equipos} colors={colors} focus={focus} onFocus={setFocus} nombres={nombres} />
        : vista === "equipos" && equipos.length > 0 && !individual
        ? <TeamBoard equipos={equipos} rows={rows} colors={colors} focus={focus} onFocus={setFocus} onPick={onPick} />
        : <StudentGameTable rows={rows} colors={colors} focus={individual ? null : focus} onPick={onPick} />}
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
        {eq.length > 1 && barra(`Promedio de tu equipo (${j.equipo || "—"})`, promEq)}
        {barra("Promedio de la clase", prom)}
      </div>
      {j.tiempos && j.tiempos.length > 0 && <TrimestreBars mine={j.tiempos} classRows={classRows} />}
      <TeamEvolution row={row} classRows={classRows} individual={eq.length <= 1} />
      <div className="sg-kpis k3">
        <div><small>Tiempo dedicado</small><b>{fmtMin(j.minutos)}</b></div>
        <div><small>{eq.length > 1 ? "Scorecard acumulado del equipo" : "Scorecard acumulado"}</small><b>{fmt(j.bsc_acum)}</b></div>
        <div><small>Trimestres jugados</small><b>{ultimoT(j) || "—"}</b></div>
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

/* ---------- Comparar: tiempo y Scorecard acumulado entre series ---------- */
export function GameBars({ series }: { series: { name: string; color: string; rows: Row[] }[] }) {
  const avg = (rr: Row[], f: (r: Row) => number | null | undefined) => { const v = rr.map(f).filter((x): x is number => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const datos = series.map((s) => ({ ...s, min: avg(s.rows, (r) => r.juego?.minutos), bsc: avg(s.rows, (r) => r.juego?.bsc_acum), n: s.rows.filter((r) => r.juego).length }));
  if (!datos.some((d) => d.n)) return <p className="muted">Ninguno de los elementos elegidos tiene desempeño del juego importado (informe «igrades»).</p>;
  const bloque = (titulo: string, k: "min" | "bsc", f: (v: number | null) => string) => {
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
      {bloque("Scorecard acumulado promedio", "bsc", (v) => fmt(v))}
      <CompareQuarters series={series} />
      <p className="muted tiny">Solo cuentan los estudiantes con desempeño importado: {datos.map((d) => `${d.name} ${d.n}`).join(" · ")}.</p>
    </div>
  );
}

/* ---------- Evolución por trimestre ---------- */
export interface QSerie { name: string; key?: string; color: string; values: (number | null)[]; dashed?: boolean; dim?: boolean; bold?: boolean; }
const Q_LABEL: Record<SerieQ, string> = { bsc: "Scorecard del trimestre", bsc_acum: "Scorecard acumulado", tiempo: "Tiempo del trimestre" };
const qFmt = (k: SerieQ) => (v: number | null) => (k === "tiempo" ? fmtMin(v) : fmt(v));

/** Líneas por trimestre (T1…Tn). Al pasar el cursor por un trimestre se listan los valores. */
export function QuarterLines({ series, n, k, height = 260, onPick }: { series: QSerie[]; n: number; k: SerieQ; height?: number; onPick?(name: string): void }) {
  const [hq, setHq] = useState<number | null>(null);
  const f = qFmt(k);
  const W = 640, H = height, L = 48, R = 18, T = 14, B = 30;
  const all = series.flatMap((s) => s.values).filter((v): v is number => typeof v === "number");
  if (n < 1 || !all.length) return <p className="muted small">Aún no hay datos por trimestre para esta medida.</p>;
  const lo = Math.min(0, ...all), hi = Math.max(1, ...all) * 1.08;
  const X = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R));
  const Y = (v: number) => H - B - ((v - lo) / (hi - lo)) * (H - B - T);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) / 4) * i);
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const orden = [...series].sort((a, b) => Number(!!b.dim) - Number(!!a.dim) || Number(!!a.bold) - Number(!!b.bold));
  const tip = hq === null ? [] : series.filter((s) => !s.dim && s.values[hq] !== null).sort((a, b) => (b.values[hq] ?? 0) - (a.values[hq] ?? 0));
  return (
    <div className="qlines">
      <div className="tscatter-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={Q_LABEL[k] + " por trimestre"} onMouseLeave={() => setHq(null)}>
          {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="gl" /><text x={L - 8} y={Y(v) + 4} className="tk" textAnchor="end">{k === "tiempo" ? fmtMin(v) : Math.round(v)}</text></g>)}
          {Array.from({ length: n }, (_, i) => (
            <g key={i}>
              {hq === i && <rect x={X(i) - 18} y={T} width={36} height={H - B - T} className="qhover" />}
              <text x={X(i)} y={H - 8} className="tk" textAnchor="middle">T{i + 1}</text>
              <rect x={X(i) - (W - L - R) / Math.max(1, n - 1) / 2} y={T} width={(W - L - R) / Math.max(1, n - 1)} height={H - B - T} fill="transparent" onMouseEnter={() => setHq(i)} />
            </g>
          ))}
          {orden.map((s) => (
            <g key={s.name} className={"qs" + (s.dim ? " dim" : "") + (s.bold ? " bold" : "")} onClick={() => onPick?.(s.key ?? s.name)} style={{ cursor: onPick ? "pointer" : undefined }}>
              <path d={path(s.values)} stroke={s.color} strokeDasharray={s.dashed ? "5 4" : undefined} />
              {s.values.map((v, i) => v !== null && <circle key={i} cx={X(i)} cy={Y(v)} r={s.bold ? 4.5 : 3} fill={s.color} />)}
            </g>
          ))}
        </svg>
        {hq !== null && tip.length > 0 && (
          <div className="ts-tip q-tip" style={{ left: `${(X(hq) / W) * 100}%`, top: "8%" }}>
            <b>Trimestre {hq + 1}</b>
            {tip.slice(0, 8).map((s) => <span key={s.name}><i className="dot" style={{ background: s.color }} /> {s.name} <b>{f(s.values[hq])}</b></span>)}
            {tip.length > 8 && <span>y {tip.length - 8} más…</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Vista «Trimestres» de la clase: líneas por equipo + tabla de cambios entre trimestres */
export function QuarterPanel({ equipos, colors, focus, onFocus, nombres }: {
  equipos: DesempenoEquipo[]; colors: Map<string, string>; focus: string | null; onFocus(e: string | null): void;
  /** Juego individual: nombre del estudiante de cada empresa */
  nombres?: Map<string, string>;
}) {
  const n = nTrim(equipos);
  const disponibles = (["bsc_acum", "tiempo"] as SerieQ[]).filter((k) => equipos.some((e) => valoresQ(e, k, n).filter((v) => v !== null).length > 0));
  const [k, setK] = useState<SerieQ>(disponibles[0] ?? "bsc_acum");
  const f = qFmt(k);
  const series = equipos.map((e) => {
    const on = !!focus && sameEq(e.equipo, focus);
    // individual: todas las líneas en gris suave y la elegida en color, para que se lea sin una leyenda de 25 colores
    return { name: nombres?.get(e.equipo.trim().toUpperCase()) ?? e.equipo, key: e.equipo, values: valoresQ(e, k, n),
      color: nombres ? (on ? "var(--accent)" : "var(--text-3)") : colors.get(e.equipo) ?? "#888",
      dim: !!focus && !on, bold: on };
  });
  const prom = promedioQ(series.map((s) => s.values), n);
  const conPuntos = series.filter((s) => s.values.some((v) => v !== null));
  const ultimo = (v: (number | null)[]) => { for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null) return i; return -1; };
  const filas = [...conPuntos].sort((a, b) => (b.values[ultimo(b.values)] ?? -1) - (a.values[ultimo(a.values)] ?? -1));
  // mayor mejora entre el primer y el último trimestre con dato
  const cambio = (v: (number | null)[]) => { const xs = v.map((x, i) => [x, i] as const).filter(([x]) => x !== null); return xs.length > 1 ? xs[xs.length - 1][0]! - xs[0][0]! : null; };
  const mejora = [...conPuntos].map((s) => ({ s, d: cambio(s.values) })).filter((x) => x.d !== null).sort((a, b) => b.d! - a.d!);
  const pocos = n < 2 || conPuntos.every((s) => s.values.filter((v) => v !== null).length < 2);
  if (!disponibles.length) return <p className="muted small">Este informe trae un solo corte. Sube los igrades de otros trimestres de este juego (…-q1, …-q2…) a esta misma clase y aquí verás cómo evoluciona cada equipo.</p>;
  return (
    <div className="qpanel">
      <div className="card-h">
        {disponibles.length > 1
          ? <Segmented size="sm" value={k} onChange={setK} options={disponibles.map((x) => ({ value: x, label: x === "bsc_acum" ? "Scorecard acumulado" : "Tiempo" }))} />
          : <span className="muted small"><b>{Q_LABEL[k]}</b> por trimestre</span>}
        {mejora.length > 0 && <span className="muted small">Mayor mejora: <b>{mejora[0].s.name}</b> ({mejora[0].d! >= 0 ? "+" : ""}{f(mejora[0].d)})</span>}
      </div>
      <QuarterLines n={n} k={k} onPick={(name) => onFocus(focus && sameEq(focus, name) ? null : name)}
        series={[...series, { name: "Promedio de la clase", color: "var(--text-2)", values: prom, dashed: true, bold: !focus }]} />
      {pocos && <p className="note small">Por ahora solo hay un trimestre con este dato. Cada igrades nuevo de este juego que subas a esta clase añade un punto a las líneas.</p>}
      <div className="table-scroll sgt-scroll qtable-wrap">
        <table className="etable qtable">
          <thead><tr><th>{nombres ? "Estudiante" : "Equipo"}</th>{Array.from({ length: n }, (_, i) => <th key={i} className="num">T{i + 1}</th>)}<th className="num">Cambio</th></tr></thead>
          <tbody>
            {[{ name: "Promedio de la clase", color: "var(--text-2)", values: prom, dim: false, bold: false }, ...filas].map((s, idx) => {
              const d = cambio(s.values);
              return (
                <tr key={s.name} className={(idx === 0 ? "avg-row" : "") + (s.dim ? " faded" : "") + (s.bold ? " on" : "")} onClick={() => { const key = (s as QSerie).key ?? s.name; if (idx > 0) onFocus(focus && sameEq(focus, key) ? null : key); }}>
                  <td><span className="eq-cell"><span className="dot" style={{ background: s.color }} /><b>{s.name}</b></span></td>
                  {s.values.map((v, i) => {
                    const p = i > 0 ? s.values[i - 1] : null;
                    const up = v !== null && p !== null ? v - p : null;
                    return <td key={i} className="num">{f(v)}{up !== null && Math.abs(up) > 0.05 && <small className={up > 0 ? "pos" : "neg"}>{up > 0 ? " ▲" : " ▼"}</small>}</td>;
                  })}
                  <td className="num">{d === null ? "—" : <b className={d >= 0 ? "pos" : "neg"}>{d >= 0 ? "+" : ""}{f(d)}</b>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted tiny">{Q_LABEL[k]} de cada {nombres ? "estudiante" : "equipo"} en cada trimestre. ▲/▼ = sube o baja frente al trimestre anterior; «Cambio» = del primer al último trimestre con dato. Toca una línea o una fila para resaltar{nombres ? "lo" : " el equipo"}.</p>
    </div>
  );
}

/** Ficha del estudiante: cómo le fue a su equipo trimestre a trimestre frente a la clase */
function TeamEvolution({ row, classRows, individual }: { row: Row; classRows: Row[]; individual: boolean }) {
  const j = row.juego!;
  const n = nTrim([j]);
  const mine = valoresQ(j, "bsc_acum", n);
  if (mine.filter((v) => v !== null).length < 2) return null;
  const prom = promedioQ(classRows.filter((r) => r.juego).map((r) => valoresQ(r.juego!, "bsc_acum", n)), n);
  const last = mine.reduce<number | null>((a, v) => (v !== null ? v : a), null), first = mine.find((v) => v !== null) ?? null;
  const d = last !== null && first !== null ? last - first : null;
  return (
    <div className="sg-trim">
      <h4 className="sub-h">{individual ? "Tu Scorecard acumulado por trimestre" : "Scorecard acumulado de tu equipo por trimestre"}</h4>
      {d !== null && <p className="small">Del primer al último trimestre {individual ? "tu Scorecard" : "tu equipo"} {Math.abs(d) < 0.5 ? "se mantuvo estable" : d > 0 ? <>mejoró <b className="pos">+{fmt(d)}</b> puntos</> : <>bajó <b className="neg">{fmt(d)}</b> puntos</>}.</p>}
      <QuarterLines n={n} k="bsc_acum" height={200} series={[
        { name: individual ? "Tú" : j.equipo || "Tu equipo", color: "var(--accent)", values: mine, bold: true },
        { name: "Promedio de la clase", color: "var(--text-2)", values: prom, dashed: true }]} />
    </div>
  );
}

/** Comparar: Scorecard promedio por trimestre de cada serie */
function CompareQuarters({ series }: { series: { name: string; color: string; rows: Row[] }[] }) {
  const js = series.flatMap((s) => s.rows.map((r) => r.juego).filter((x): x is NonNullable<typeof x> => !!x));
  const n = nTrim(js);
  const [k, setK] = useState<SerieQ>("bsc_acum");
  const qs = series.map((s) => ({ name: s.name, color: s.color, values: promedioQ(s.rows.filter((r) => r.juego).map((r) => valoresQ(r.juego!, k, n)), n) }));
  if (n < 2 || !qs.some((q) => q.values.filter((v) => v !== null).length >= 2)) return null;
  return (
    <div className="gb-block">
      <div className="card-h"><h4 className="sub-h">Por trimestre</h4>
        <Segmented size="sm" value={k} onChange={setK} options={[{ value: "bsc_acum", label: "Scorecard acumulado" }, { value: "tiempo", label: "Tiempo" }]} /></div>
      <QuarterLines n={n} k={k} height={230} series={qs} />
    </div>
  );
}

/* ---------- Fuera de los gráficos: quien no completó la simulación o no está en el informe ---------- */
export function IncompleteList({ items, equipos, meta, sinJuego, onPick }: {
  items: Incompleto[]; equipos: DesempenoEquipo[]; meta: number; sinJuego: number; onPick(r: Row): void;
}) {
  const [open, setOpen] = useState(false);
  const eqSolos = equipos.filter((e) => !items.some((i) => i.d.equipo.trim().toUpperCase() === e.equipo.trim().toUpperCase()));
  const nT = items.filter((i) => i.motivo === "trimestres").length, nS = items.length - nT;
  if (!items.length && !eqSolos.length && !sinJuego) return null;
  const barra = (h: number) => <span className="inc-prog" title={`Llegó al trimestre ${h} de ${meta}`}>{Array.from({ length: meta }, (_, k) => <i key={k} className={k < h ? "on" : ""} />)}</span>;
  return (
    <div className="inc-box">
      <button type="button" className="inc-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="inc-ico"><Icon name="alert" size={15} /></span>
        <span className="rank-txt"><b>Fuera de los gráficos · {items.length + eqSolos.length}</b>
          <small>{[nT && plural(nT, `no llegó al trimestre ${meta}`, `no llegaron al trimestre ${meta}`), nS && plural(nS, "no está en el Informe de Preparación Profesional", "no están en el Informe de Preparación Profesional"), eqSolos.length && plural(eqSolos.length, "equipo sin integrantes válidos", "equipos sin integrantes válidos")].filter(Boolean).join(" · ") || "—"}</small></span>
        <Icon name="chevron" size={14} />
      </button>
      {open && <>
        <p className="muted small">Se registra hasta dónde llegaron, pero <b>no cuentan en gráficos, promedios ni comparaciones</b>: sus datos están incompletos. La meta es el trimestre más alto que alcanzó la clase{meta ? ` (T${meta})` : ""}.</p>
        {items.length > 0 && (
          <div className="table-scroll sgt-scroll">
            <table className="etable inc-table">
              <thead><tr><th>Jugador</th><th>Llegó hasta</th><th className="num">Tiempo</th><th className="num">Scorecard acum.</th><th>Motivo</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.d.id} onClick={() => i.row && onPick(i.row)} className={i.row ? "" : "nolink"}>
                    <td><b>{displayName(i.d.nombre)}</b><span className="eq-cell">{i.d.equipo || "—"}</span></td>
                    <td><span className="inc-hasta">{meta ? barra(i.hasta) : null}<small>{i.hasta ? `T${i.hasta}` : "sin trimestres"}{meta ? ` de ${meta}` : ""}</small></span></td>
                    <td className="num">{fmtMin(i.d.minutos)}</td>
                    <td className="num">{fmt(i.d.bsc_acum)}</td>
                    <td>{i.motivo === "trimestres" ? <span className="pf warn">No completó</span>
                      : <span className="pf bad" title="Puede que no terminara la simulación o que su nombre no coincida con el del informe: si es así, corrígelo en «Editar» de la clase.">{i.hasta >= meta ? "Sin informe de competencias" : "No completó · sin informe"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {eqSolos.length > 0 && <p className="muted small">Equipos sin integrantes válidos: {eqSolos.map((e) => `${e.equipo} (T${ultimoT(e) || "—"})`).join(", ")}.</p>}
        {sinJuego > 0 && <p className="muted small">{plural(sinJuego, "estudiante del informe de competencias no aparece", "estudiantes del informe de competencias no aparecen")} en el desempeño del juego: sus competencias sí cuentan; sus tiempos no se conocen.</p>}
        {nS > 0 && <p className="muted tiny">«Sin informe de competencias»: si en realidad sí está en la clase con otro nombre, corrígelo en <b>Editar</b> y se enlazará solo.</p>}
      </>}
    </div>
  );
}

/** Ficha de quien no completó: se muestra hasta dónde llegó, sin compararlo con la clase */
export function StudentGamePartial({ d, meta }: { d: Desempeno; meta: number }) {
  const h = ultimoT(d);
  return (
    <div className="card pad sgame partial">
      <h3>Desempeño en el juego</h3>
      <p className="sg-frase">No completó la simulación: llegó {h ? `hasta el trimestre ${h}` : "sin trimestres registrados"}{meta ? ` de ${meta}` : ""}.</p>
      <div className="sg-kpis">
        <div><small>Último trimestre</small><b>{h ? "T" + h : "—"}</b></div>
        <div><small>Tiempo registrado</small><b>{fmtMin(d.minutos)}</b></div>
        <div><small>Scorecard acumulado del equipo</small><b>{fmt(d.bsc_acum)}</b></div>
        <div><small>Equipo</small><b className="sm">{d.equipo || "—"}</b></div>
      </div>
      <p className="muted tiny">Estos datos son incompletos: no se usan en gráficos, promedios ni comparaciones de la clase.</p>
    </div>
  );
}
