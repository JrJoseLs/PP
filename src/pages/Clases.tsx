import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { Avatar, Empty, Icon, Select } from "../components/ui";
import { Radar } from "../components/Radar";
import { LevelBar, Ring } from "../components/Charts";
import { avgIndex, avgVector, normText, plural } from "../lib/metrics";
import { PageHead } from "./Dashboard";

export default function Clases() {
  const { snap, rowsByClase, user, maestrosOf, person } = useApp();
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
      <PageHead title="Clases" sub={rol === "maestro" ? "Las clases que tu decano te asignó." : rol === "decano" ? "Las clases que administración te entregó. Asígnalas a tus maestros." : "Todas las clases cargadas."}
        actions={rol === "admin" && <Link className="btn primary" to="/importar"><Icon name="plus" size={16} /> Importar</Link>} />
      {snap.clases.length > 0 && (
        <div className="toolbar">
          <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar clase o grupo" /></label>
          {ownerOpts.length > 0 && <Select value={owner} onChange={setOwner} allLabel={rol === "admin" ? "Todos los decanos" : "Todos los maestros"}
            options={[...ownerOpts.map((p) => ({ value: p.id, label: p.nombre })), { value: "none", label: rol === "admin" ? "Sin decano" : "Sin maestro" }]} />}
          <Select value={sort} onChange={(v) => setSort(v as typeof sort)} options={[{ value: "nombre", label: "Nombre" }, { value: "indice", label: "Mejor índice" }, { value: "n", label: "Más estudiantes" }]} />
        </div>
      )}
      {!snap.clases.length && <Empty icon="classes" title="Sin clases todavía">{rol === "admin" ? <Link className="btn primary" to="/importar">Importar clases</Link> : <p>Cuando te asignen clases aparecerán aquí.</p>}</Empty>}
      {snap.clases.length > 0 && !list.length && <Empty icon="search" title="Nada coincide con tu búsqueda" />}
      <div className="cgrid">
        {list.map(({ c, rr, idx, vec }) => {
          const ms = maestrosOf(c);
          return (
            <Link key={c.id} to={"/clases/" + c.id} className="ccard card" style={{ ["--c" as string]: c.color }}>
              <div className="ccard-top">
                <div className="ccard-radar"><Radar compact size={120} labels={c.metrics} series={[{ name: c.nombre, color: c.color, values: vec as number[] }]} /></div>
                <Ring value={idx} size={54} stroke={6} />
              </div>
              <h3>{c.nombre}</h3>
              <div className="muted small">Grupo {c.grupo || "—"}{c.periodo ? " · " + c.periodo : ""} · {plural(rr.length, "estudiante", "estudiantes")}</div>
              <LevelBar rows={rr} />
              <div className="ccard-foot">
                {rol !== "maestro" && (ms.length
                  ? <span className="avatars">{ms.slice(0, 3).map((m) => <Avatar key={m.id} name={m.nombre} size={24} />)}<small>{ms.map((m) => m.nombre.split(" ")[0]).join(", ")}</small></span>
                  : <span className="pill warn">Sin maestro</span>)}
                {rol === "admin" && (c.decanos.length
                  ? <span className="pill">{c.decanos.map((d) => person(d)?.nombre ?? "—").join(", ")}</span>
                  : <span className="pill warn">Sin decano</span>)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
