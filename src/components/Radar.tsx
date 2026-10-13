/* Gráfico araña interactivo, sin dependencias.
   Mantiene la lectura del original:
   - "Más afuera = mejor": las competencias de riesgo (↓) se invierten para que una figura
     más grande signifique siempre mejor rendimiento; el detalle muestra los valores reales.
   - Franjas de nivel (bajo < 34 · alto ≥ 66) y sector sombreado de las competencias de riesgo.
   - Detalle por competencia al pasar el cursor o tocar; leyenda para ocultar o resaltar series.
   Y suma: transición animada, valores sobre los puntos, promedio por serie y descarga en PNG. */
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, isRisk, mean, metricLevel } from "../lib/metrics";
import { Icon } from "./ui";
import { metricDesc, metricName } from "../lib/labels";

export interface Series { name: string; color: string; values: (number | null)[]; dash?: boolean; muted?: boolean; }

function useMorph(target: number[][], ms = 650) {
  const [cur, setCur] = useState(target);
  const from = useRef(target);
  const curRef = useRef(target);
  const key = JSON.stringify(target);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setCur(target); curRef.current = target; return; }
    from.current = curRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const next = target.map((vals, s) => vals.map((v, i) => { const a = from.current[s]?.[i] ?? 0; return a + (v - a) * e; }));
      curRef.current = next; setCur(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cur;
}

function wrap(t: string, max: number) {
  const words = t.split(" "); const lines = [""];
  words.forEach((w) => { const c = (lines[lines.length - 1] ? lines[lines.length - 1] + " " : "") + w;
    if (c.length > max && lines[lines.length - 1] !== "") lines.push(w); else lines[lines.length - 1] = c; });
  return lines.slice(0, 3);
}

export function Radar({ labels, series, size = 560, invert = true, compact = false, onInvert, title }: {
  labels: string[]; series: Series[]; size?: number; invert?: boolean; compact?: boolean; onInvert?(v: boolean): void; title?: string;
}) {
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<number | null>(null);
  const [axis, setAxis] = useState<{ i: number; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [cw, setCw] = useState(0);
  useEffect(() => { setHidden(new Set()); }, [series.length]);
  useEffect(() => {
    if (compact || !wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [compact]);

  // En pantallas angostas se usa un lienzo más pequeño para que las etiquetas se lean
  const narrow = !compact && cw > 0 && cw < 480;
  const N = labels.length;
  const W = narrow ? 430 : size;
  const R = compact ? W / 2 - 6 : W / 2 - (narrow ? 76 : 104);
  const H = compact ? size : 2 * R + (narrow ? 64 : 84);
  const cx = W / 2, cy = H / 2;
  const risk = useMemo(() => labels.map(isRisk), [labels]);
  const shown = (v: number | null, i: number) => (v === null ? 0 : invert && risk[i] ? 100 - v : v);
  const target = series.map((s) => labels.map((_, i) => shown(s.values[i] ?? null, i)));
  const vals = useMorph(target);
  const visible = series.length - hidden.size;

  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, v: number, rr?: number) => {
    const r = rr ?? (Math.max(0, Math.min(v, 100)) / 100) * R;
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
  };
  const ring = (f: number) => labels.map((_, i) => pt(i, 0, R * f).map((n) => n.toFixed(1)).join(",")).join(" ");
  const sector = (a0: number, a1: number, rr: number) =>
    `M${cx},${cy} L${(cx + rr * Math.cos(a0)).toFixed(1)},${(cy + rr * Math.sin(a0)).toFixed(1)} A${rr},${rr} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${(cx + rr * Math.cos(a1)).toFixed(1)},${(cy + rr * Math.sin(a1)).toFixed(1)} Z`;

  if (N < 3) return <div className="empty-mini">Se necesitan al menos 3 competencias.</div>;

  // sector de las competencias de riesgo (contiguas en el informe del juego)
  const rIdx = risk.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  const half = Math.PI / N;
  const riskPath = !compact && rIdx.length ? sector(ang(rIdx[0]) - half, ang(rIdx[rIdx.length - 1]) + half, R + 8) : null;
  const avgOf = (s: Series) => mean(labels.map((m, i) => (isRisk(m) ? null : s.values[i])));

  const onMove = (e: React.PointerEvent) => {
    if (compact) return;
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * W - cx, sy = ((e.clientY - box.top) / box.height) * H - cy;
    const d = Math.hypot(sx, sy);
    if (d < R * 0.06 || d > R + 90) { setAxis(null); return; }
    let a = Math.atan2(sy, sx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    const i = Math.round(a / ((2 * Math.PI) / N)) % N;
    const wb = wrapRef.current!.getBoundingClientRect();
    setAxis({ i, x: e.clientX - wb.left, y: e.clientY - wb.top });
  };

  const tip = axis && !compact ? (() => {
    const i = axis.i, lab = labels[i];
    const rows = series.map((s, k) => ({ s, k, v: s.values[i] ?? null }))
      .filter((x) => !hidden.has(x.k) && x.v !== null)
      .sort((a, b) => (risk[i] ? a.v! - b.v! : b.v! - a.v!));
    const wb = wrapRef.current?.getBoundingClientRect();
    const left = wb && axis.x > wb.width / 2 ? axis.x - 264 : axis.x + 18;
    return (
      <div className="radar-tip" style={{ left: Math.max(4, left), top: Math.max(4, Math.min(axis.y - 20, (wb?.height ?? 600) - 60 - rows.length * 24)) }}>
        <div className="rt-h">{metricName(lab)}{risk[i] && <span className="rt-r">↓ menos es mejor</span>}</div>
        {metricDesc(lab) && <div className="rt-d">{metricDesc(lab)}</div>}
        {rows.map((x, j) => {
          const l = metricLevel(lab, x.v);
          return (
            <div key={x.k} className={"rt-row" + (j === 0 && rows.length > 1 ? " best" : "")}>
              <span className={"sq" + (x.s.dash ? " dash" : "")} style={{ background: x.s.color, color: x.s.color }} />
              <span className="rt-n">{x.s.name}</span>
              <b>{fmt(x.v)}</b>
              <span className={"lvl " + (l?.id ?? "")}>{l && l.id !== "medio" ? l.label.toLowerCase() : ""}</span>
            </div>
          );
        })}
        {!rows.length && <div className="muted">Sin datos</div>}
        {rows.length > 1 && <div className="rt-f">Diferencia entre el mejor y el peor: <b>{fmt(Math.abs(rows[0].v! - rows[rows.length - 1].v!))}</b></div>}
      </div>
    );
  })() : null;

  const showValues = axis && visible <= 3;

  return (
    <div className={"radar" + (compact ? " compact" : "") + (narrow ? " narrow" : "")} ref={wrapRef} onPointerLeave={() => setAxis(null)}>
      {!compact && (
        <div className="radar-tools">
          {onInvert && (
            <label className="switch-label" title="Invierte las competencias de riesgo (↓) para que en todos los ejes estar más afuera sea mejor">
              <input type="checkbox" className="switch" checked={invert} onChange={(e) => onInvert(e.target.checked)} />
              Más afuera = mejor
            </label>
          )}
          <span className="muted tiny grow">Pasa el cursor o toca una competencia para ver los valores.</span>
          <button type="button" className="icon-btn sm" title="Descargar imagen (PNG)" aria-label="Descargar imagen"
            onClick={() => svgRef.current && exportPng(svgRef.current, series.filter((_, k) => !hidden.has(k)), title ?? "grafico-arana")}>
            <Icon name="download" size={16} />
          </button>
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title ?? "Gráfico araña de competencias"} onPointerMove={onMove} onPointerDown={onMove}>
        {invert && !compact && <>
          <polygon points={ring(1)} className="band hi" />
          <polygon points={ring(0.66)} className="band mid" />
          <polygon points={ring(0.34)} className="band lo" />
        </>}
        {riskPath && <path d={riskPath} className="risk-sector" />}
        {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} className="grid" />)}
        {labels.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className={"spoke" + (axis?.i === i ? " on" : "")} />; })}
        {!compact && [25, 50, 75, 100].map((v) => <text key={v} x={cx + 4} y={cy - (R * v) / 100 + 10} className="tick">{v}</text>)}

        {series.map((s, k) => hidden.has(k) ? null : (
          <g key={k} className={"series" + (focus !== null && focus !== k ? " dim" : "") + (focus === k ? " focus" : "")}>
            <polygon points={vals[k]?.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(",")).join(" ")}
              fill={s.color} fillOpacity={s.muted ? 0.05 : compact ? 0.24 : focus === k ? 0.32 : 0.2} stroke={s.color}
              strokeWidth={compact ? 1.5 : focus === k ? 3 : 2} strokeDasharray={s.dash ? "6 4" : undefined} strokeLinejoin="round" />
            {!compact && !s.muted && vals[k]?.map((v, i) => { const [x, y] = pt(i, v); const on = axis?.i === i;
              return <circle key={i} cx={x} cy={y} r={on ? 5.5 : 2.8} fill={s.color} className={"vtx" + (on ? " on" : "")} />; })}
          </g>
        ))}

        {showValues && series.map((s, k) => {
          if (hidden.has(k) || s.values[axis!.i] === null || s.values[axis!.i] === undefined) return null;
          const [x, y] = pt(axis!.i, vals[k][axis!.i]);
          const a = ang(axis!.i);
          return <text key={k} x={x + 10 * Math.cos(a + Math.PI / 2)} y={y + 10 * Math.sin(a + Math.PI / 2) + 3} className="vlabel" fill={s.color}>{fmt(s.values[axis!.i])}</text>;
        })}

        {!compact && labels.map((lab, i) => {
          const a = ang(i), lx = cx + (R + 16) * Math.cos(a), ly = cy + (R + 16) * Math.sin(a);
          const anchor = Math.cos(a) > 0.04 ? "start" : Math.cos(a) < -0.04 ? "end" : "middle";
          const lines = wrap(metricName(lab) + (risk[i] ? " ↓" : ""), Math.abs(Math.cos(a)) < 0.3 ? 13 : narrow ? 12 : 16);
          const center = Math.abs(Math.cos(a)) < 0.2 ? 6 : 0;
          const dy = Math.sin(a) > 0.5 ? 10 + center : Math.sin(a) < -0.5 ? -4 - center - (lines.length - 1) * 12 : 4 - (lines.length - 1) * 6;
          return (
            <text key={i} x={lx} y={ly + dy} textAnchor={anchor} className={"axl" + (risk[i] ? " risk" : "") + (axis?.i === i ? " on" : "")}>
              {lines.map((ln, k) => <tspan key={k} x={lx} dy={k ? 12 : 0}>{ln}</tspan>)}
            </text>
          );
        })}
      </svg>
      {tip}
      {!compact && <>
        <div className="radar-legend">
          {series.map((s, k) => {
            const avg = avgOf(s);
            return (
              <button key={k} type="button" className={"rl" + (hidden.has(k) ? " off" : "")} title="Clic para ocultar o mostrar"
                onMouseEnter={() => !hidden.has(k) && setFocus(k)} onMouseLeave={() => setFocus(null)}
                onClick={() => {
                  const h = new Set(hidden);
                  if (h.has(k)) h.delete(k); else if (visible > 1) h.add(k);
                  setHidden(h); setFocus(null);
                }}>
                <span className={"sq" + (s.dash ? " dash" : "")} style={{ background: s.color, color: s.color }} />
                <span className="rl-n">{s.name}</span>
                {avg !== null && <span className="rl-v">{fmt(avg)}</span>}
              </button>
            );
          })}
        </div>
        <p className="radar-note">{invert
          ? <>Las competencias de riesgo (↓, en rojo) están invertidas: estar más afuera significa menos riesgo. <i className="key lo" /> nivel bajo · <i className="key hi" /> nivel alto. El número de cada serie es su índice general.</>
          : <>Escala original: en las competencias de riesgo (↓, en rojo) un valor más alto es peor. El número de cada serie es su índice general.</>}</p>
      </>}
    </div>
  );
}

/* ---------- Descargar como PNG (con estilos resueltos y leyenda) ---------- */
async function exportPng(svg: SVGSVGElement, series: Series[], name: string) {
  const vb = svg.viewBox.baseVal;
  const legendH = 18 + Math.ceil(series.length / 2) * 22;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
  const props = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-weight", "font-family"];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    (dst[i] as SVGElement).setAttribute("style", props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  });
  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--card").trim() || "#fff", ink = css.getPropertyValue("--text").trim() || "#000";
  const resolved = [...svg.querySelectorAll<SVGPolygonElement>(".series > polygon")].map((p) => getComputedStyle(p).stroke);
  const H = vb.height + legendH;
  clone.setAttribute("viewBox", `0 0 ${vb.width} ${H}`);
  clone.setAttribute("width", String(vb.width)); clone.setAttribute("height", String(H));
  const ns = "http://www.w3.org/2000/svg";
  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("width", "100%"); rect.setAttribute("height", "100%"); rect.setAttribute("fill", bg);
  clone.insertBefore(rect, clone.firstChild);
  series.forEach((s, k) => {
    const x = 24 + (k % 2) * (vb.width / 2), y = vb.height + 12 + Math.floor(k / 2) * 22;
    const sw = document.createElementNS(ns, "rect");
    sw.setAttribute("x", String(x)); sw.setAttribute("y", String(y)); sw.setAttribute("width", "11"); sw.setAttribute("height", "11"); sw.setAttribute("rx", "2");
    sw.setAttribute("fill", resolved[k] || s.color);
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", String(x + 18)); t.setAttribute("y", String(y + 10));
    t.setAttribute("style", `font: 500 12px -apple-system, Inter, Segoe UI, sans-serif; fill:${ink}`);
    t.textContent = s.name;
    clone.append(sw, t);
  });
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = url; });
  const scale = 2, canvas = document.createElement("canvas");
  canvas.width = vb.width * scale; canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const a = document.createElement("a");
  a.download = name.replace(/[\\/:*?"<>|]+/g, " ").trim() + ".png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}
