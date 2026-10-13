import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, usePref } from "../data/store";
import { useShell } from "../components/Layout";
import { Avatar, Empty, Icon, LevelChip, Segmented, Select } from "../components/ui";
import { displayName, fmt, isRisk, levelOf, metricLevel, metricValue, normText, plural, sparseMetrics, type Row } from "../lib/metrics";
import { PageHead } from "./Dashboard";
import { metricDesc, metricName } from "../lib/labels";

const PAGE = 100;

export default function Estudiantes() {
  const { snap, rows, metrics, toast } = useApp();
  const { openStudent } = useShell();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [clase, setClase] = useState("all");
  const [carrera, setCarrera] = useState("all");
  const [nivel, setNivel] = useState(params.get("nivel") ?? "all");
  const [mode, setMode] = usePref<"resumen" | "mapa">("estMode", "resumen");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "indice", dir: nivel === "bajo" ? 1 : -1 });
  const [limit, setLimit] = useState(PAGE);

  const carreras = useMemo(() => [...new Set(rows.map((r) => r.carrera))].sort((a, b) => a.localeCompare(b, "es")), [rows]);
  const sparse = useMemo(() => sparseMetrics(rows, metrics), [rows, metrics]);
  const cols = metrics.filter((m) => !sparse.has(m));

  const list = useMemo(() => {
    const n = normText(q);
    const out = rows.filter((r) =>
      (clase === "all" || r.cls.id === clase) && (carrera === "all" || r.carrera === carrera) &&
      (nivel === "all" || levelOf(r.indice)?.id === nivel) && (!n || r.q.includes(n)));
    const get = (r: Row): number | string => sort.k === "nombre" ? displayName(r.r.nombre) : sort.k === "clase" ? r.cls.nombre : sort.k === "carrera" ? r.carrera
      : sort.k === "indice" ? r.indice ?? -1 : metricValue(r, sort.k) ?? -1;
    return out.sort((a, b) => { const x = get(a), y = get(b); return (typeof x === "string" ? x.localeCompare(y as string, "es") : x - (y as number)) * sort.dir; });
  }, [rows, q, clase, carrera, nivel, sort]);

  const th = (k: string, label: string, cls = "") => (
    <th className={cls}><button className={"th" + (sort.k === k ? " on" : "")} onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : k === "nombre" || k === "clase" || k === "carrera" ? 1 : -1 })}>
      {label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button></th>);

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = list.map((r) => {
      const o: Record<string, string | number | null> = { Estudiante: displayName(r.r.nombre), Matrícula: r.r.matricula, Carrera: r.carrera, Grupo: r.grupo, Clase: r.cls.nombre, "Índice general": r.indice === null ? null : Math.round(r.indice * 10) / 10, Nivel: levelOf(r.indice)?.label ?? "" };
      metrics.forEach((m) => { o[metricName(m)] = metricValue(r, m); });
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Estudiantes");
    XLSX.writeFile(wb, `estudiantes-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast(`Exportados ${list.length} estudiantes`);
  };

  if (!rows.length) return <><PageHead title="Estudiantes" /><Empty icon="students" title="Aún no hay estudiantes visibles" /></>;
  const ids = list.map((r) => r.r.id);

  return (
    <>
      <PageHead title="Estudiantes" sub={`${plural(list.length, "estudiante", "estudiantes")}${list.length !== rows.length ? " de " + rows.length : ""}`}
        actions={<button className="btn" onClick={exportXlsx}><Icon name="download" size={16} /> Exportar Excel</button>} />
      <div className="toolbar">
        <label className="search grow"><Icon name="search" size={16} /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Nombre, matrícula o grupo" /></label>
        <Select value={clase} onChange={setClase} allLabel="Todas las clases" options={snap.clases.map((c) => ({ value: c.id, label: c.nombre }))} />
        <Select value={carrera} onChange={setCarrera} allLabel="Todas las carreras" options={carreras.map((c) => ({ value: c, label: c }))} />
        <Select value={nivel} onChange={setNivel} allLabel="Todos los niveles" options={[{ value: "alto", label: "Nivel alto" }, { value: "medio", label: "Nivel medio" }, { value: "bajo", label: "Nivel bajo" }]} />
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "resumen", label: "Resumen" }, { value: "mapa", label: "Mapa de calor" }]} />
      </div>

      <div className="card table-card">
        <div className="table-scroll">
          <table className={"etable" + (mode === "mapa" ? " heat" : "")}>
            <thead><tr>
              {th("nombre", "Estudiante", "sticky")}
              {mode === "resumen" ? <>{th("clase", "Clase")}{th("carrera", "Carrera")}<th className="hide-sm">Grupo</th>{th("indice", "Índice", "num")}<th>Nivel</th></>
                : <>{th("indice", "Índice", "num")}{cols.map((m) => <th key={m} className="vert" title={metricName(m) + (metricDesc(m) ? " · " + metricDesc(m) : "")}><button className={"th" + (sort.k === m ? " on" : "")} onClick={() => setSort({ k: m, dir: sort.k === m ? (-sort.dir as 1 | -1) : -1 })}><span>{metricName(m)}{isRisk(m) ? " ↓" : ""}</span></button></th>)}</>}
            </tr></thead>
            <tbody>
              {list.slice(0, limit).map((r) => (
                <tr key={r.r.id} onClick={() => openStudent(r.r.id, ids)}>
                  <td className="sticky"><span className="st-name"><Avatar name={r.r.nombre} size={26} color={r.cls.color} /><span>{displayName(r.r.nombre)}{r.r.matricula && <small className="muted"> · {r.r.matricula}</small>}</span></span></td>
                  {mode === "resumen" ? <>
                    <td><span className="dot" style={{ background: r.cls.color }} /> {r.cls.nombre}</td>
                    <td className="muted">{r.carrera}</td>
                    <td className="muted hide-sm">{r.grupo}</td>
                    <td className="num"><span className="idxbar"><i style={{ width: (r.indice ?? 0) + "%" }} /></span><b>{fmt(r.indice)}</b></td>
                    <td><LevelChip v={r.indice} /></td>
                  </> : <>
                    <td className={"num hc " + (levelOf(r.indice)?.id ?? "")}><b>{fmt(r.indice, 0)}</b></td>
                    {cols.map((m) => { const v = metricValue(r, m); return <td key={m} className={"num hc " + (metricLevel(m, v)?.id ?? "")}>{fmt(v, 0)}</td>; })}
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty icon="search" title="Nadie coincide con los filtros" />}
        {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit(limit + PAGE)}>Mostrar {Math.min(PAGE, list.length - limit)} más</button></div>}
      </div>
    </>
  );
}
