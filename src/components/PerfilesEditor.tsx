/* Ajustes → Perfiles por carrera (solo administración): las 5 competencias clave de cada carrera
   y cuánto pesan en el índice de perfil. Las carreras con R o S al final usan el perfil de su base. */
import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Icon } from "./ui";
import { metricDesc, metricName } from "../lib/labels";
import { normText } from "../lib/metrics";
import { COMPETENCIAS_CLAVE, PERFILES_BASE, PESO_BASE, perfilDe, perfilesCfg, type Perfil } from "../lib/perfiles";

export function PerfilesEditor() {
  const { run, snap } = useApp();
  const inicial = () => { const c = perfilesCfg(); return { peso: c.peso, perfiles: JSON.parse(JSON.stringify(c.perfiles)) as Record<string, Perfil> }; };
  const [f, setF] = useState(inicial);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const dirty = JSON.stringify(f) !== JSON.stringify(perfilesCfg());

  // carreras que aparecen en los datos (códigos de estudiantes y del catálogo), para ver cuáles tienen perfil
  const carreras = useMemo(() => {
    const nombres = new Map(snap.carreras.map((c) => [c.codigo, c.nombre]));
    const cod = new Set([...snap.resultados.map((r) => r.carrera), ...snap.carreras.map((c) => c.codigo)].filter(Boolean));
    return [...cod].sort().map((c) => ({ codigo: c, nombre: nombres.get(c) ?? "" }));
  }, [snap.resultados, snap.carreras]);
  const usaPerfil = (codigo: string) => carreras.filter((c) => {
    const n = normText(c.codigo), base = n.replace(/[RS]$/, "");
    return n === codigo || (base !== n && base === codigo && !f.perfiles[n]) || (!f.perfiles[n] && normText(c.nombre) === normText(f.perfiles[codigo]?.nombre ?? "#"));
  }).map((c) => c.codigo);
  const sinPerfil = carreras.filter((c) => {
    const n = normText(c.codigo), base = n.replace(/[RS]$/, "");
    return !f.perfiles[n] && !f.perfiles[base] && !Object.values(f.perfiles).some((p) => normText(p.nombre) === normText(c.nombre || c.codigo));
  });

  const setPerfil = (k: string, p: Partial<Perfil>) => setF({ ...f, perfiles: { ...f.perfiles, [k]: { ...f.perfiles[k], ...p } } });
  const toggle = (k: string, comp: string) => {
    const cl = f.perfiles[k].claves;
    const on = cl.some((x) => normText(x) === normText(comp));
    if (on) setPerfil(k, { claves: cl.filter((x) => normText(x) !== normText(comp)) });
    else if (cl.length < 5) setPerfil(k, { claves: [...cl, comp] });
  };
  const agregar = (codigo: string, nombre = "") => {
    const k = normText(codigo).replace(/\s+/g, "");
    if (!k || f.perfiles[k]) { setAbierto(k || null); return; }
    setF({ ...f, perfiles: { ...f.perfiles, [k]: { nombre: nombre || codigo, claves: [] } } });
    setAbierto(k); setNuevo("");
  };
  const quitar = (k: string) => { const p = { ...f.perfiles }; delete p[k]; setF({ ...f, perfiles: p }); };
  const incompletos = Object.entries(f.perfiles).filter(([, p]) => p.claves.length !== 5).map(([k]) => k);

  return (
    <section className="card pad">
      <h3>Perfiles por carrera</h3>
      <p className="muted small">Cada carrera tiene 5 competencias clave. Su <b>índice de perfil</b> pesa esas 5 más que las demás: sirve para comparar a estudiantes de la misma carrera. El índice general (CRR) no cambia.</p>

      <label className="peso-row">
        <span>Peso de las 5 claves</span>
        <input type="range" min={50} max={100} step={5} value={Math.round(f.peso * 100)} onChange={(e) => setF({ ...f, peso: Number(e.target.value) / 100 })} />
        <b>{Math.round(f.peso * 100)} %</b>
        <span className="muted small">{f.peso < 1 ? `el resto de competencias: ${Math.round((1 - f.peso) * 100)} %` : "solo cuentan las 5 claves"}</span>
      </label>

      <div className="perfiles">
        {Object.entries(f.perfiles).sort(([a], [b]) => a.localeCompare(b)).map(([k, p]) => {
          const usan = usaPerfil(k);
          const open = abierto === k;
          return (
            <div className={"perfil" + (open ? " open" : "")} key={k}>
              <button type="button" className="perfil-h" onClick={() => setAbierto(open ? null : k)} aria-expanded={open}>
                <b className="perfil-cod">{k}</b>
                <span className="perfil-nom">{p.nombre}{usan.length > 0 && <small className="muted"> · {usan.join(", ")}</small>}</span>
                <span className="perfil-claves">{p.claves.map((c) => <span key={c} className="clave">{metricName(c)}</span>)}
                  {p.claves.length < 5 && <span className="pf warn">{5 - p.claves.length} por elegir</span>}</span>
                <Icon name="chevron" size={14} />
              </button>
              {open && (
                <div className="perfil-body">
                  <div className="perfil-meta">
                    <label>Nombre <input value={p.nombre} onChange={(e) => setPerfil(k, { nombre: e.target.value })} /></label>
                    <button type="button" className="link small danger" onClick={() => quitar(k)}><Icon name="trash" size={13} /> Quitar perfil</button>
                  </div>
                  <p className="muted small">Elige 5 ({p.claves.length}/5):</p>
                  <div className="comp-pick">
                    {COMPETENCIAS_CLAVE.map((c) => {
                      const on = p.claves.some((x) => normText(x) === normText(c));
                      return <button type="button" key={c} className={"cpick" + (on ? " on" : "")} disabled={!on && p.claves.length >= 5} title={metricDesc(c)} onClick={() => toggle(k, c)}>{on && <Icon name="check" size={12} />}{metricName(c)}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sinPerfil.length > 0 && (
        <p className="small">Carreras sin perfil (usan solo el CRR): {sinPerfil.map((c) => (
          <button type="button" key={c.codigo} className="link small" onClick={() => agregar(c.codigo, c.nombre)}>{c.codigo} +</button>))}</p>
      )}
      <div className="row-gap wrap">
        <input className="perfil-nuevo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Código de carrera (ej. ARQ)" maxLength={12}
          onKeyDown={(e) => { if (e.key === "Enter") agregar(nuevo); }} />
        <button type="button" className="btn ghost sm" disabled={!nuevo.trim()} onClick={() => agregar(nuevo)}><Icon name="plus" size={14} /> Agregar perfil</button>
      </div>
      {incompletos.length > 0 && <p className="note small">Perfiles con menos de 5 claves: {incompletos.join(", ")}. Se calculan con las que tengan.</p>}
      <div className="row-gap wrap" style={{ marginTop: 10 }}>
        {dirty && <button className="btn primary" onClick={() => run((a) => a.setAjuste("perfiles", f), "Perfiles guardados")}>Guardar perfiles</button>}
        {dirty && <button className="btn ghost" onClick={() => setF(inicial())}>Descartar</button>}
        <button className="btn ghost sm" onClick={() => { if (confirm("¿Volver a la propuesta inicial de perfiles? Se pierden tus cambios en esta sección.")) setF({ peso: PESO_BASE, perfiles: JSON.parse(JSON.stringify(PERFILES_BASE)) }); }}>Restaurar propuesta inicial</button>
      </div>
      <p className="muted tiny">Ejemplo de cómo se asigna: {["ISOR", "ATHS", "Administración"].map((c) => `${c} → ${perfilDe(c)?.codigo ?? "sin perfil"}`).join(" · ")}.</p>
    </section>
  );
}
