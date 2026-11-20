/* Resumen de la simulación para Inicio: en qué trimestre va cada clase (T3, T4, T6…),
   cuántos completaron, Scorecard acumulado promedio y tiempo por estudiante.
   Solo cuenta a quienes completaron (los demás quedan «fuera de los gráficos», igual que en cada clase). */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../data/store";
import { Icon, Stat } from "./ui";
import { fmtMin } from "../lib/game";
import { fmt, mean, plural } from "../lib/metrics";
import type { Clase } from "../lib/types";

export function GameSummary({ clases }: { clases: Clase[] }) {
  const { juegoByClase } = useApp();
  const go = useNavigate();
  const [t, setT] = useState<number | null>(null);

  const filas = useMemo(() => clases.map((c) => {
    const j = juegoByClase.get(c.id);
    if (!j || (!j.jugadores.length && !j.equipos.length)) return null;
    return { c, meta: j.meta, completos: j.completos.length, total: j.jugadores.length,
      sc: mean(j.equiposOk.map((e) => e.bsc_acum)), tiempo: mean(j.completos.map((x) => x.minutos)), minutos: j.completos.map((x) => x.minutos) };
  }).filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.meta - a.meta || (b.sc ?? -1e9) - (a.sc ?? -1e9)), [clases, juegoByClase]);

  if (!filas.length) return null;
  const sinJuego = clases.length - filas.length;
  const etapas = [...new Set(filas.map((f) => f.meta))].sort((a, b) => b - a);
  const tope = Math.max(6, ...etapas);
  const vista = t === null ? filas : filas.filter((f) => f.meta === t);
  const completos = vista.reduce((a, f) => a + f.completos, 0), total = vista.reduce((a, f) => a + f.total, 0);

  return (
    <section className="card pad gsum">
      <div className="card-h">
        <h3><Icon name="bolt" size={18} /> Simulación</h3>
        <span className="muted small">{plural(filas.length, "clase con datos del juego", "clases con datos del juego")}{sinJuego ? ` · ${sinJuego} sin datos` : ""}</span>
      </div>

      <div className="gsum-etapas" role="group" aria-label="Filtrar por trimestre alcanzado">
        <button type="button" className={"etapa" + (t === null ? " on" : "")} onClick={() => setT(null)}><b>Todas</b><small>{plural(filas.length, "clase", "clases")}</small></button>
        {etapas.map((e) => (
          <button type="button" key={e} className={"etapa" + (t === e ? " on" : "")} onClick={() => setT(t === e ? null : e)}>
            <b>{e ? `T${e}` : "Sin iniciar"}</b><small>{plural(filas.filter((f) => f.meta === e).length, "clase", "clases")}</small>
          </button>
        ))}
      </div>

      <div className="stats gsum-kpis">
        <Stat label="Completaron la simulación" value={total ? `${Math.round((completos / total) * 100)}%` : "—"} sub={`${completos} de ${total} estudiantes`} />
        <Stat label="Scorecard acumulado" value={fmt(mean(vista.map((f) => f.sc)))} sub="promedio de las clases" />
        <Stat label="Tiempo por estudiante" value={fmtMin(mean(vista.flatMap((f) => f.minutos)))} sub="promedio, solo quienes completaron" />
      </div>

      <div className="gsum-list">
        <div className="gsum-row gsum-h"><span>Clase</span><span>Avance</span><span className="num">Completaron</span><span className="num">Scorecard</span><span className="num hide-sm">Tiempo</span></div>
        {vista.map((f) => (
          <button type="button" key={f.c.id} className="gsum-row" onClick={() => go("/clases/" + f.c.id)}>
            <span className="gsum-n"><span className="dot" style={{ background: f.c.color }} />{f.c.nombre}</span>
            <span className="gsum-av" title={`Trimestre ${f.meta} de ${tope}`}>
              {Array.from({ length: tope }, (_, k) => <i key={k} className={k < f.meta ? "on" : ""} />)}<b>T{f.meta || "—"}</b>
            </span>
            <span className="num">{f.completos} de {f.total}</span>
            <span className="num"><b>{fmt(f.sc)}</b></span>
            <span className="num muted hide-sm">{fmtMin(f.tiempo)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
