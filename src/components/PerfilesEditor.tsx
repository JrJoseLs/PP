/* Ajustes → Carreras y perfiles (solo administración).
   Una fila por carrera que aparece en tus datos (las nuevas salen solas al importar):
   - su nombre visible: se guarda en el catálogo de carreras y se ve en toda la app;
   - su perfil: las 5 competencias clave del índice de perfil. Las variantes con R o S al final
     (ISOR, ATHS…) usan el perfil de su carrera base, salvo que se les cree uno propio. */
import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Icon } from "./ui";
import { metricDesc, metricName } from "../lib/labels";
import { normText, plural } from "../lib/metrics";
import { COMPETENCIAS_CLAVE, PERFILES_BASE, PESO_BASE, perfilesCfg, type Perfil } from "../lib/perfiles";

export function PerfilesEditor() {
  const { snap, refresh, toast, api } = useApp();
  const inicialPerfiles = () => { const c = perfilesCfg(); return { peso: c.peso, perfiles: JSON.parse(JSON.stringify(c.perfiles)) as Record<string, Perfil> }; };
  const inicialNombres = () => Object.fromEntries(snap.carreras.map((c) => [c.codigo, c.nombre]));
  const [f, setF] = useState(inicialPerfiles);
  const [nombres, setNombres] = useState<Record<string, string>>(inicialNombres);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // carreras con estudiantes (y las del catálogo), con cuántos estudiantes tiene cada una
  const filas = useMemo(() => {
    const n = new Map<string, number>();
    snap.resultados.forEach((r) => { if (r.carrera) n.set(r.carrera, (n.get(r.carrera) ?? 0) + 1); });
    snap.carreras.forEach((c) => { if (!n.has(c.codigo)) n.set(c.codigo, 0); });
    return [...n].map(([codigo, total]) => ({ codigo, total })).sort((a, b) => a.codigo.localeCompare(b.codigo, "es"));
  }, [snap.resultados, snap.carreras]);

  /** Perfil que usa una carrera con los perfiles que se están editando */
  const perfilDe = (codigo: string): { k: string; propio: boolean } | null => {
    const c = normText(codigo), base = c.replace(/[RS]$/, "");
    if (f.perfiles[c]) return { k: c, propio: true };
    if (base !== c && f.perfiles[base]) return { k: base, propio: false };
    const nom = normText(nombres[codigo] ?? codigo);
    const porNombre = Object.entries(f.perfiles).find(([, p]) => normText(p.nombre) === nom || normText(p.nombre) === c);
    return porNombre ? { k: porNombre[0], propio: false } : null;
  };
  const nombreVisible = (codigo: string) => nombres[codigo] || f.perfiles[normText(codigo)]?.nombre || "";

  const setPerfil = (k: string, p: Partial<Perfil>) => setF({ ...f, perfiles: { ...f.perfiles, [k]: { ...f.perfiles[k], ...p } } });
  const toggle = (k: string, comp: string) => {
    const cl = f.perfiles[k].claves;
    if (cl.some((x) => normText(x) === normText(comp))) setPerfil(k, { claves: cl.filter((x) => normText(x) !== normText(comp)) });
    else if (cl.length < 5) setPerfil(k, { claves: [...cl, comp] });
  };
  const crear = (codigo: string, copiaDe?: string) => {
    const k = normText(codigo).replace(/\s+/g, "");
    setF({ ...f, perfiles: { ...f.perfiles, [k]: { nombre: nombreVisible(codigo) || codigo, claves: copiaDe ? [...f.perfiles[copiaDe].claves] : [] } } });
    setAbierto(codigo);
  };
  const quitar = (k: string) => { const p = { ...f.perfiles }; delete p[k]; setF({ ...f, perfiles: p }); };

  const cambiosNombres = filas.filter((x) => (nombres[x.codigo] ?? "") !== (snap.carreras.find((c) => c.codigo === x.codigo)?.nombre ?? ""));
  const dirty = cambiosNombres.length > 0 || JSON.stringify(f) !== JSON.stringify(perfilesCfg());
  const sinPerfil = filas.filter((x) => x.total > 0 && !perfilDe(x.codigo));
  const huerfanos = Object.keys(f.perfiles).filter((k) => !filas.some((x) => normText(x.codigo) === k || normText(x.codigo).replace(/[RS]$/, "") === k));

  const guardar = async () => {
    setBusy(true);
    try {
      // el nombre del perfil sigue al de la carrera
      const perfiles = Object.fromEntries(Object.entries(f.perfiles).map(([k, p]) => {
        const fila = filas.find((x) => normText(x.codigo) === k);
        return [k, { ...p, nombre: (fila && nombres[fila.codigo]?.trim()) || p.nombre }];
      }));
      if (cambiosNombres.length) await api.upsertCarreras(cambiosNombres.map((x) => ({ codigo: x.codigo, nombre: (nombres[x.codigo] ?? "").trim() })));
      if (JSON.stringify({ ...f, perfiles }) !== JSON.stringify(perfilesCfg())) await api.setAjuste("perfiles", { ...f, perfiles });
      await refresh();
      toast("Carreras y perfiles guardados");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };

  return (
    <section className="card pad">
      <h3>Carreras y perfiles</h3>
      <p className="muted small">Cada carrera tiene un <b>nombre visible</b> (se usa en toda la app) y un <b>perfil</b>: sus 5 competencias clave, que pesan más en su <b>índice de perfil</b>. El índice general (CRR) no cambia. Las carreras nuevas aparecen aquí solas al importar.</p>

      <label className="peso-row">
        <span>Peso de las 5 claves</span>
        <input type="range" min={50} max={100} step={5} value={Math.round(f.peso * 100)} onChange={(e) => setF({ ...f, peso: Number(e.target.value) / 100 })} />
        <b>{Math.round(f.peso * 100)} %</b>
        <span className="muted small">{f.peso < 1 ? `el resto de competencias: ${Math.round((1 - f.peso) * 100)} %` : "solo cuentan las 5 claves"}</span>
      </label>

      {sinPerfil.length > 0 && <p className="note small">{plural(sinPerfil.length, "carrera no tiene", "carreras no tienen")} perfil: {sinPerfil.map((x) => x.codigo).join(", ")}. Sus estudiantes solo tienen el CRR.</p>}

      <div className="perfiles">
        {filas.map(({ codigo, total }) => {
          const pf = perfilDe(codigo);
          const p = pf ? f.perfiles[pf.k] : null;
          const open = abierto === codigo;
          return (
            <div className={"perfil" + (open ? " open" : "") + (!pf && total ? " sin" : "")} key={codigo}>
              <div className="perfil-h">
                <b className="perfil-cod">{codigo.length > 8 ? codigo.slice(0, 8) + "…" : codigo}</b>
                <input className="perfil-nom" value={nombres[codigo] ?? ""} placeholder={f.perfiles[normText(codigo)]?.nombre || "Nombre de la carrera"}
                  onChange={(e) => setNombres({ ...nombres, [codigo]: e.target.value })} aria-label={`Nombre de ${codigo}`} />
                <span className="muted small perfil-n">{plural(total, "estudiante", "estudiantes")}</span>
                <button type="button" className="perfil-claves" onClick={() => setAbierto(open ? null : codigo)} aria-expanded={open} title="Ver o cambiar su perfil">
                  {p ? <>{!pf!.propio && <span className="pf">usa {pf!.k}</span>}{p.claves.map((c) => <span key={c} className="clave">{metricName(c)}</span>)}
                    {p.claves.length < 5 && <span className="pf warn">{5 - p.claves.length} por elegir</span>}</>
                    : <span className="pf warn">Sin perfil · crear</span>}
                  <Icon name="chevron" size={14} />
                </button>
              </div>
              {open && (
                <div className="perfil-body">
                  {!pf && <div className="row-gap wrap"><span className="small">Esta carrera no tiene perfil.</span>
                    <button type="button" className="btn primary sm" onClick={() => crear(codigo)}>Crear perfil</button></div>}
                  {pf && !pf.propio && <div className="row-gap wrap"><span className="small">Usa el perfil de <b>{pf.k}</b> ({f.perfiles[pf.k].nombre}). Si lo cambias aquí, cambia para todas las que lo usan.</span>
                    <button type="button" className="btn ghost sm" onClick={() => crear(codigo, pf.k)}>Darle un perfil propio</button></div>}
                  {pf && <>
                    <p className="muted small">Competencias clave ({p!.claves.length}/5):</p>
                    <div className="comp-pick">
                      {COMPETENCIAS_CLAVE.map((c) => {
                        const on = p!.claves.some((x) => normText(x) === normText(c));
                        return <button type="button" key={c} className={"cpick" + (on ? " on" : "")} disabled={!on && p!.claves.length >= 5} title={metricDesc(c)} onClick={() => toggle(pf.k, c)}>{on && <Icon name="check" size={12} />}{metricName(c)}</button>;
                      })}
                    </div>
                    {pf.propio && <button type="button" className="link small danger" onClick={() => quitar(pf.k)}><Icon name="trash" size={13} /> Quitar perfil</button>}
                  </>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {huerfanos.length > 0 && <p className="muted small">Perfiles listos para carreras que aún no tienen estudiantes: {huerfanos.join(", ")}.</p>}

      <div className="row-gap wrap" style={{ marginTop: 10 }}>
        {dirty && <button className="btn primary" disabled={busy} onClick={guardar}>{busy ? <span className="spinner" /> : "Guardar cambios"}</button>}
        {dirty && <button className="btn ghost" onClick={() => { setF(inicialPerfiles()); setNombres(inicialNombres()); }}>Descartar</button>}
        <button className="btn ghost sm" onClick={() => { if (confirm("¿Volver a la propuesta inicial de perfiles? Los nombres de las carreras no cambian.")) setF({ peso: PESO_BASE, perfiles: JSON.parse(JSON.stringify(PERFILES_BASE)) }); }}>Restaurar perfiles iniciales</button>
      </div>
      {api.mode === "cloud" && <p className="muted tiny">El nombre de cada carrera se guarda en el catálogo de carreras; los estudiantes conservan su código, así que el cambio se ve en toda la app.</p>}
    </section>
  );
}
