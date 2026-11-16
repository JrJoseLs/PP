import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { Avatar, Empty, Icon, Select } from "../components/ui";
import { Radar } from "../components/Radar";
import { LevelBar, Ring } from "../components/Charts";
import { avgIndex, avgVector, fmt, mean, normText, plural } from "../lib/metrics";
import { fmtMin } from "../lib/game";
import { PageHead } from "./Dashboard";
import { D, M, cargoDe, low } from "../lib/labels";

export default function Clases() {
  const { snap, rowsByClase, user, maestrosOf, person, juegoByClase } = useApp();
  const [q, setQ] = useState("");
  const [owner, setOwner] = usePref("clasesOwner", "all");
  const [sort, setSort] = usePref<"nombre" | "indice" | "n">("clasesSort", "nombre");
  const rol = user!.rol;

  const ownerOpts = rol === "admin" ? snap.profiles.filter((p) => p.rol === "decano") : rol === "decano" ? snap.profiles.filter((p) => p.rol === "maestro") : [];
  const list = useMemo(() => {
    const n = normText(q);
    return snap.clases
      .filter((c) => !n || normText(c.nombre + " " + c.grupo + " " + c.periodo).includes(n))
      .filter((c) => owner === "all" || (owner === "none" ? (rol === "admin" ? !c.decanos.length : !c.maestros.length) : rol === "admin" ? c.decanos.includes(owner) : c.maestros.includes(owner)))
      .map((c) => { const rr = rowsByClase.get(c.id) ?? []; return { c, rr, idx: avgIndex(rr), vec: avgVector(rr, c.metrics) }; })
      .sort((a, b) => sort === "indice" ? (b.idx ?? -1) - (a.idx ?? -1) : sort === "n" ? b.rr.length - a.rr.length : a.c.nombre.localeCompare(b.c.nombre, "es"));
  }, [snap.clases, rowsByClase, q, owner, sort, rol]);

  return (
    <>
      <PageHead title="Clases" sub={rol === "maestro" ? "Las clases que te asignaron." : rol === "decano" ? `Las clases que administración te entregó. Asígnalas a tus ${low(M().many)}.` : "Todas las clases cargadas."}
        actions={rol === "admin" && <Link className="btn primary" to="/importar"><Icon name="plus" size={16} /> Importar</Link>} />
      {snap.clases.length > 0 && (
        <div className="toolbar">
          <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar clase o grupo" /></label>
          {ownerOpts.length > 0 && <Select value={owner} onChange={setOwner} allLabel={`Todos los ${low((rol === "admin" ? D() : M()).many)}`}
            options={[...ownerOpts.map((p) => ({ value: p.id, label: p.nombre })), { value: "none", label: `Sin ${low((rol === "admin" ? D() : M()).one)}` }]} />}
          <Select value={sort} onChange={(v) => setSort(v as typeof sort)} options={[{ value: "nombre", label: "Nombre" }, { value: "indice", label: "Mejor índice" }, { value: "n", label: "Más estudiantes" }]} />
        </div>
      )}
      {!snap.clases.length && <Empty icon="classes" title="Sin clases todavía">{rol === "admin" ? <Link className="btn primary" to="/importar">Importar clases</Link> : <p>Cuando te asignen clases aparecerán aquí.</p>}</Empty>}
      {snap.clases.length > 0 && !list.length && <Empty icon="search" title="Nada coincide con tu búsqueda" />}
      <div className="cgrid">
        {list.map(({ c, rr, idx, vec }) => {
          const ms = maestrosOf(c);
          const ds = c.decanos.map((d) => person(d)).filter((p): p is NonNullable<typeof p> => !!p);
          // sin informe de competencias todavía: se resume el desempeño del juego en lugar de un radar vacío
          const conComp = c.metrics.length >= 3 && idx !== null;
          const juego = juegoByClase.get(c.id);
          const sc = mean((juego?.equiposOk ?? []).map((e) => e.bsc_acum)), tiempo = mean((juego?.completos ?? []).map((j) => j.minutos));
          const quien = (ps: { nombre: string; rol: "admin" | "decano" | "maestro"; cargo?: string | null }[], generico: string) =>
            ps.length ? <span className="who">{ps.slice(0, 3).map((p) => <Avatar key={p.nombre} name={p.nombre} size={20} />)}
              <span>{ps.map((p) => p.nombre + (cargoDe(p) !== generico ? ` (${cargoDe(p)})` : "")).join(", ")}</span></span>
              : <span className="falta">Sin asignar</span>;
          return (
            <Link key={c.id} to={"/clases/" + c.id} className="ccard card" style={{ ["--c" as string]: c.color }}>
              <div className="ccard-top">
                {conComp
                  ? <><div className="ccard-radar"><Radar compact size={120} labels={c.metrics} series={[{ name: c.nombre, color: c.color, values: vec as number[] }]} /></div>
                    <Ring value={idx} size={54} stroke={6} /></>
                  : <div className="ccard-game" title="Scorecard acumulado: la nota global de cada empresa en el simulador (Tarjeta de puntuación integral), promediada en todos los trimestres. Más alto es mejor. Aquí se muestra el promedio de quienes completaron la simulación.">
                    <small>{juego ? "Solo desempeño del juego" : "Sin datos todavía"}</small>
                    {juego && <><b>{fmt(sc)}</b><span>Scorecard promedio de la clase</span><span className="muted">{fmtMin(tiempo)} de juego por estudiante</span></>}
                    <em>Falta el informe de competencias</em>
                  </div>}
              </div>
              <h3>{c.nombre}</h3>
              <div className="muted small">{c.grupo ? "Grupo " + c.grupo : "Sin grupo"}{c.periodo ? " · " + c.periodo : ""} · {plural(rr.length, "estudiante", "estudiantes")}</div>
              {conComp && <LevelBar rows={rr} />}
              {rol !== "maestro" && (
                <div className="ccard-roles">
                  {rol === "admin" && <div><span className="lbl">{D().one}</span>{quien(ds, D().one)}</div>}
                  <div><span className="lbl">{M().many}</span>{quien(ms, M().one)}</div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
