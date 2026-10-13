import { useMemo, useState } from "react";
import { useApp, usePref } from "../data/store";
import { Avatar, Delta, Icon, LevelChip, Segmented, Sheet } from "./ui";
import { Radar, type Series } from "./Radar";
import { Ring } from "./Charts";
import { avgVector, displayName, fmt, isRisk, metricValue, personKey, sparseMetrics } from "../lib/metrics";
import { metricDesc, metricName } from "../lib/labels";

export default function StudentSheet({ id, list, onNav, onClose }: { id: string; list: string[]; onNav(id: string): void; onClose(): void }) {
  const { rows, rowsByClase, user, run } = useApp();
  const [invert, setInvert] = usePref("radarInvert", true);
  const [vs, setVs] = useState<"clase" | "carrera" | "ambos">("clase");
  const [editing, setEditing] = useState(false);

  const row = rows.find((r) => r.r.id === id);
  const data = useMemo(() => {
    if (!row) return null;
    const m = row.cls.metrics;
    const classRows = rowsByClase.get(row.cls.id) ?? [];
    const carRows = rows.filter((r) => r.carrera === row.carrera);
    const clsAvg = avgVector(classRows, m), carAvg = avgVector(carRows, m);
    const ranked = classRows.filter((r) => r.indice !== null).sort((a, b) => b.indice! - a.indice!);
    const rank = ranked.findIndex((r) => r === row) + 1;
    const sparse = sparseMetrics(classRows, m);
    const deltas = m.map((name, i) => ({ name, v: row.r.valores[i], avg: clsAvg[i], d: clsAvg[i] === null ? 0 : row.r.valores[i] - clsAvg[i]! }))
      .filter((x) => !sparse.has(x.name));
    const pos = deltas.filter((x) => !isRisk(x.name)).sort((a, b) => b.d - a.d);
    const riskHigh = deltas.filter((x) => isRisk(x.name) && x.v >= 50).sort((a, b) => b.v - a.v);
    const others = rows.filter((r) => r !== row && personKey(r.r) === personKey(row.r));
    return { m, classRows, carRows, clsAvg, carAvg, rank, total: ranked.length, pos, riskHigh, deltas, others };
  }, [row, rows, rowsByClase]);

  if (!row || !data) return null;
  const idx = list.indexOf(id);
  const series: Series[] = [{ name: displayName(row.r.nombre).split(" ").slice(0, 2).join(" "), color: row.cls.color, values: row.r.valores }];
  if (vs !== "carrera") series.push({ name: "Promedio de la clase", color: "var(--text-3)", values: data.clsAvg as number[], dash: true, muted: true });
  if (vs !== "clase") series.push({ name: "Promedio de " + row.carrera, color: "var(--accent-2)", values: data.carAvg as number[], dash: true, muted: true });
  const pct = data.total > 1 ? Math.round((1 - (data.rank - 1) / (data.total - 1)) * 100) : null;

  return (
    <Sheet open onClose={onClose} wide title={
      <div className="sheet-nav">
        <button className="icon-btn" disabled={idx <= 0} onClick={() => onNav(list[idx - 1])} aria-label="Anterior"><Icon name="back" /></button>
        <button className="icon-btn" disabled={idx < 0 || idx >= list.length - 1} onClick={() => onNav(list[idx + 1])} aria-label="Siguiente"><Icon name="chevron" /></button>
        {list.length > 1 && <span className="muted tiny">{idx + 1} de {list.length}</span>}
      </div>}>
      <div className="st-head">
        <Avatar name={row.r.nombre} size={56} color={row.cls.color} />
        <div className="st-id">
          <h2>{displayName(row.r.nombre)}</h2>
          <div className="st-meta">
            <span>{row.carrera}</span>
            <span>{row.cls.nombre}</span>
            <span>Grupo {row.grupo}</span>
            {row.r.matricula && <span>Mat. {row.r.matricula}</span>}
            {user?.rol === "admin" && <button className="link" onClick={() => setEditing((e) => !e)}><Icon name="edit" size={14} /> Editar</button>}
          </div>
        </div>
        <div className="st-score">
          <Ring value={row.indice} size={74} />
          <div><LevelChip v={row.indice} /><small>{data.rank ? `#${data.rank} de ${data.total}` : ""}{pct !== null ? ` · mejor que el ${pct}%` : ""}</small></div>
        </div>
      </div>

      {editing && <EditRow id={row.r.id} carrera={row.r.carrera} grupo={row.r.grupo} matricula={row.r.matricula}
        onSave={async (p) => { await run((a) => a.updateResultado(row.r.id, p), "Datos actualizados"); setEditing(false); }} />}

      <div className="card pad">
        <div className="card-h">
          <h3>Perfil de competencias</h3>
          <Segmented size="sm" value={vs} onChange={setVs} options={[{ value: "clase", label: "vs clase" }, { value: "carrera", label: "vs carrera" }, { value: "ambos", label: "ambos" }]} />
        </div>
        <Radar labels={data.m} series={series} size={520} invert={invert} onInvert={setInvert} />
      </div>

      <div className="grid2">
        <div className="card pad">
          <h3 className="h-ico good"><Icon name="arrowUp" size={16} /> Fortalezas</h3>
          <ul className="ilist">{data.pos.slice(0, 4).map((x) => (
            <li key={x.name}><span title={metricDesc(x.name)}>{metricName(x.name)}</span><span className="v">{fmt(x.v)} <Delta v={x.d} /></span></li>))}</ul>
        </div>
        <div className="card pad">
          <h3 className="h-ico bad"><Icon name="arrowDown" size={16} /> Para reforzar</h3>
          <ul className="ilist">{data.pos.slice(-4).reverse().map((x) => (
            <li key={x.name}><span title={metricDesc(x.name)}>{metricName(x.name)}</span><span className="v">{fmt(x.v)} <Delta v={x.d} /></span></li>))}</ul>
          {data.riskHigh.length > 0 && <>
            <h4 className="sub-h">Alertas de riesgo ↓</h4>
            <ul className="ilist">{data.riskHigh.slice(0, 3).map((x) => (
              <li key={x.name}><span title={metricDesc(x.name)}>{metricName(x.name)}</span><span className="v neg">{fmt(x.v)}</span></li>))}</ul>
          </>}
        </div>
      </div>

      {data.others.length > 0 && (
        <div className="card pad">
          <h3>También aparece en</h3>
          <ul className="ilist">{data.others.map((o) => (
            <li key={o.r.id}><button className="link" onClick={() => onNav(o.r.id)}><span className="dot" style={{ background: o.cls.color }} /> {o.cls.nombre}</button>
              <span className="v">{fmt(o.indice)} <Delta v={row.indice !== null && o.indice !== null ? o.indice - row.indice : null} /></span></li>))}</ul>
        </div>
      )}

      <div className="card pad">
        <h3>Todas las competencias</h3>
        <div className="mtable">
          <div className="mt-row mt-h"><span>Competencia</span><span>Valor</span><span>Clase</span><span>Δ</span></div>
          {data.m.map((m, i) => {
            const v = metricValue(row, m), a = data.clsAvg[i];
            return (
              <div className="mt-row" key={m}>
                <span className={isRisk(m) ? "risk" : ""} title={metricDesc(m)}>{metricName(m)}{isRisk(m) ? " ↓" : ""}</span>
                <span className="mt-bar"><i style={{ width: (v ?? 0) + "%", background: row.cls.color }} /><b>{fmt(v)}</b></span>
                <span className="muted">{fmt(a)}</span>
                <span><Delta v={v !== null && a !== null ? v - a : null} invert={isRisk(m)} /></span>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

function EditRow({ carrera, grupo, matricula, onSave }: { id: string; carrera: string; grupo: string; matricula: string; onSave(p: { carrera: string; grupo: string; matricula: string }): void }) {
  const { snap } = useApp();
  const [c, setC] = useState(carrera), [g, setG] = useState(grupo), [m, setM] = useState(matricula);
  return (
    <form className="card pad edit-row" onSubmit={(e) => { e.preventDefault(); onSave({ carrera: c.trim().toUpperCase(), grupo: g.trim(), matricula: m.trim() }); }}>
      <label className="field"><span>Carrera (código)</span><input list="carreras-dl" value={c} onChange={(e) => setC(e.target.value)} /></label>
      <datalist id="carreras-dl">{snap.carreras.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}</datalist>
      <label className="field"><span>Grupo</span><input value={g} onChange={(e) => setG(e.target.value)} /></label>
      <label className="field"><span>Matrícula</span><input value={m} onChange={(e) => setM(e.target.value)} /></label>
      <button className="btn primary">Guardar</button>
    </form>
  );
}
