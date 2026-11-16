import { useEffect, useState } from "react";
import { fmt, isRisk, levelCounts, type Row } from "../lib/metrics";
import type { Series } from "./Radar";
import { metricDesc, metricName } from "../lib/labels";

/** Anillo de progreso (índice 0–100) */
export function Ring({ value, size = 64, stroke = 7, color }: { value: number | null; size?: number; stroke?: number; color?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setV(value ?? 0)); return () => cancelAnimationFrame(t); }, [value]);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = color ?? (value === null ? "var(--fill-3)" : value >= 66 ? "var(--good)" : value < 34 ? "var(--bad)" : "var(--warn)");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(v, 100)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" }} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" className="ring-txt" style={{ fontSize: size * 0.27 }}>{fmt(value, 0)}</text>
    </svg>
  );
}

/** Barra apilada bajo / medio / alto */
export function LevelBar({ rows, showLabels = false, height = 8 }: { rows: Row[]; showLabels?: boolean; height?: number }) {
  const c = levelCounts(rows);
  const t = c.total || 1;
  const parts = [["bajo", c.bajo], ["medio", c.medio], ["alto", c.alto]] as const;
  return (
    <div className="levelbar-wrap">
      <div className="levelbar" style={{ height }} title={`Bajo ${c.bajo} · Medio ${c.medio} · Alto ${c.alto}`}>
        {parts.map(([k, n]) => n ? <span key={k} className={k} style={{ width: (n / t) * 100 + "%" }} /> : null)}
      </div>
      {showLabels && (
        <div className="levelbar-lab">
          <span><i className="bajo" />Bajo <b>{c.bajo}</b></span>
          <span><i className="medio" />Medio <b>{c.medio}</b></span>
          <span><i className="alto" />Alto <b>{c.alto}</b></span>
        </div>
      )}
    </div>
  );
}

/** Barras horizontales por competencia, una barra por serie */
export function MetricBars({ labels, series }: { labels: string[]; series: Series[] }) {
  return (
    <div className="mbars">
      {labels.map((m, i) => (
        <div className="mbar-row" key={m}>
          <div className={"mbar-lab" + (isRisk(m) ? " risk" : "")} title={metricDesc(m)}>{metricName(m)}{isRisk(m) ? " ↓" : ""}</div>
          <div className="mbar-tracks">
            {series.map((s, k) => {
              const v = s.values[i];
              return (
                <div className="mbar-track" key={k} title={`${s.name}: ${fmt(v)}`}>
                  <span style={{ width: Math.max(0, Math.min(v ?? 0, 100)) + "%", background: s.color }} />
                  <em>{fmt(v)}</em>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Distribución del índice en 10 tramos (histograma) */
export function Histogram({ rows, color = "var(--accent)" }: { rows: Row[]; color?: string }) {
  const bins = Array.from({ length: 10 }, () => 0);
  rows.forEach((r) => { if (r.indice !== null) bins[Math.min(9, Math.floor(r.indice / 10))]++; });
  const max = Math.max(1, ...bins);
  return (
    <div className="histo" role="img" aria-label="Distribución del índice general">
      {bins.map((n, i) => (
        <div key={i} className="histo-col" title={`${i * 10}–${i * 10 + 9}: ${n} estudiantes`}>
          <span style={{ height: (n / max) * 100 + "%", background: i < 3 ? "var(--bad)" : i >= 7 ? "var(--good)" : color }} />
        </div>
      ))}
      <div className="histo-axis"><span>0</span><span>50</span><span>100</span></div>
    </div>
  );
}
