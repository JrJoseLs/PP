/* Gráficos del desempeño en el juego (informe igrades): tiempo invertido, Scorecard y puntajes. */
import { useMemo, useState } from "react";
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
export const teamColors = (equipos: string[]) => new Map([...new Set(equipos)].sort().map((e, i) => [e, SERIES_COLORS[i % SERIES_COLORS.length]]));

/* ---------- Dispersión: tiempo invertido vs. resultado, con cuadrantes ---------- */
export function TimeScatter({ rows, onPick }: { rows: Row[]; onPick(r: Row): void }) {
  const [eje, setEje] = useState<EjeY>("indice");
  const [hover, setHover] = useState<Row | null>(null);
  const pts = rows.filter((r) => r.juego?.minutos !== null && r.juego?.minutos !== undefined && EJE[eje].get(r) !== null);
  const colors = useMemo(() => teamColors(rows.map((r) => r.juego?.equipo || r.equipo || "—")), [rows]);
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
          {pts.map((p) => {
            const eq = p.juego?.equipo || p.equipo || "—";
            return <circle key={p.r.id} cx={X(p.juego!.minutos!)} cy={Y(EJE[eje].get(p)!)} r={hover === p ? 8 : 6} fill={colors.get(eq)} className="dot-pt"
              onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onPick(p)}><title>{displayName(p.r.nombre)}</title></circle>;
          })}
        </svg>
        {hover && (
          <div className="ts-tip" style={{ left: `${(X(hover.juego!.minutos!) / W) * 100}%`, top: `${(Y(EJE[eje].get(hover)!) / H) * 100}%` }}>
            <b>{displayName(hover.r.nombre)}</b><span>{hover.juego?.equipo || hover.equipo}</span>
            <span>{fmtMin(hover.juego!.minutos)} · {EJE[eje].corto} {fmt(EJE[eje].get(hover))}</span>
          </div>
        )}
      </div>
      <div className="legend">{[...colors.entries()].map(([e, c]) => <span key={e} className="lg"><span className="dot" style={{ background: c }} />{e}</span>)}</div>
      <p className="muted tiny">Las líneas punteadas son la mediana de la clase. Toca un punto para abrir la ficha del estudiante.</p>
    </div>
  );
}

/* ---------- Tablero de equipos: Scorecard acumulado y del trimestre, tiempo, percentil ---------- */
export function TeamBoard({ equipos }: { equipos: DesempenoEquipo[] }) {
  const lista = [...equipos].sort((a, b) => (b.bsc_acum ?? -1) - (a.bsc_acum ?? -1));
  const maxB = Math.max(1, ...lista.map((e) => Math.max(e.bsc_acum ?? 0, e.bsc ?? 0)));
  const maxM = Math.max(1, ...lista.map((e) => e.minutos ?? 0));
  const colors = teamColors(equipos.map((e) => e.equipo));
  return (
    <div className="tboard">
      <div className="tb-row tb-h"><span>Equipo</span><span>Scorecard acumulado <i className="mk" /> último trimestre</span><span>Tiempo total</span><span className="num">Percentil</span><span className="num">Puntaje</span></div>
      {lista.map((e, i) => (
        <div className="tb-row" key={e.equipo}>
          <span className="tb-n"><b>{i + 1}</b><span className="dot" style={{ background: colors.get(e.equipo) }} />{e.equipo}</span>
          <span className="tb-bar" title={`Acumulado ${fmt(e.bsc_acum)} · último trimestre ${fmt(e.bsc)}`}>
            <i style={{ width: ((e.bsc_acum ?? 0) / maxB) * 100 + "%", background: colors.get(e.equipo) }} />
            {e.bsc !== null && <em style={{ left: ((e.bsc ?? 0) / maxB) * 100 + "%" }} />}
            <small>{fmt(e.bsc_acum)}</small>
          </span>
          <span className="tb-bar time"><i style={{ width: ((e.minutos ?? 0) / maxM) * 100 + "%" }} /><small>{fmtMin(e.minutos)}</small></span>
          <span className="num">{e.percentil !== null ? <span className={"chip" + ((e.percentil ?? 0) >= 66 ? " alto" : (e.percentil ?? 0) < 34 ? " bajo" : "")}>{Math.round(e.percentil!)}</span> : <span className="muted">n/A</span>}</span>
          <span className="num"><b>{e.puntaje !== null ? fmt(e.puntaje) : "—"}</b></span>
        </div>
      ))}
      <p className="muted tiny">Percentil frente a todos los equipos del simulador. «n/A» = el equipo aún no completó los trimestres necesarios.</p>
    </div>
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
      <div className="sg-kpis">
        <div><small>Puntaje del juego</small><b>{fmt(j.puntaje_ajustado ?? j.puntaje)}</b>{j.puntaje_ajustado !== null && j.puntaje !== null && j.puntaje_ajustado !== j.puntaje && <em>automático {fmt(j.puntaje)}</em>}</div>
        <div><small>Scorecard acumulado del equipo</small><b>{fmt(j.bsc_acum)}</b></div>
        <div><small>Scorecard del último trimestre</small><b>{fmt(j.bsc)}</b>{j.bsc_acum !== null && j.bsc !== null && <em className={j.bsc >= j.bsc_acum ? "pos" : "neg"}>{j.bsc >= j.bsc_acum ? "▲ mejorando" : "▼ por debajo del acumulado"}</em>}</div>
        <div><small>Trimestres jugados</small><b>{j.trimestres ?? "—"}</b></div>
      </div>
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
