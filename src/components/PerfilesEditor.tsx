/* Ajustes → Carreras y perfiles.
   Administración ve todas las carreras; un coordinador, solo las que tiene a cargo.
   Por carrera: nombre visible (solo administración), coordinadores a cargo (solo administración) y su
   tabla de ponderación: 100 puntos entre las 24 competencias, con reparto automático al marcar las claves
   (★) y ajuste manual. Antes de guardar se ve cómo cambia el CRR de sus estudiantes. */
import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Avatar, Icon } from "./ui";
import { metricDesc, metricName } from "../lib/labels";
import { fmt, isRisk, mean, normText, plural, vaciasDe } from "../lib/metrics";
import { COMPETENCIAS, PCT_CLAVES_BASE, PERFILES_BASE, aCien, codigoPerfil, crrPonderado, indiceGeneral, nuevoPerfil, perfilesActuales, repartir, repartirIgual, totalPesos, type Perfil } from "../lib/perfiles";
import type { PerfilCarrera, Profile } from "../lib/types";

const aFila = (codigo: string, p: Perfil): PerfilCarrera =>
  ({ codigo, nombre: p.nombre, claves: p.claves, pesos: p.pesos, modo: p.modo, pct_claves: p.pctClaves });

export function PerfilesEditor() {
  const { snap, user, api, refresh, toast } = useApp();
  const esAdmin = user!.rol === "admin";
  const yo = snap.profiles.find((p) => p.id === user!.id);
  const misCarreras = new Set((yo?.carreras ?? []).map((c) => normText(c)));
  const perfiles = perfilesActuales();
  const coordinadores = snap.profiles.filter((p) => p.rol === "decano" && p.activo);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>(() => Object.fromEntries(snap.carreras.map((c) => [c.codigo, c.nombre])));

  // carreras con estudiantes, del catálogo y con perfil; el coordinador solo ve las suyas
  const filas = useMemo(() => {
    const n = new Map<string, number>();
    snap.resultados.forEach((r) => { if (r.carrera) n.set(r.carrera, (n.get(r.carrera) ?? 0) + 1); });
    snap.carreras.forEach((c) => { if (!n.has(c.codigo)) n.set(c.codigo, 0); });
    Object.keys(perfiles).forEach((k) => { if (![...n.keys()].some((c) => normText(c) === k)) n.set(k, 0); });
    return [...n].map(([codigo, total]) => ({ codigo, total, k: codigoPerfil(codigo, nombres[codigo]) }))
      .filter((x) => esAdmin || misCarreras.has(normText(x.codigo)) || (x.k && misCarreras.has(x.k)))
      .sort((a, b) => (b.total > 0 ? 1 : 0) - (a.total > 0 ? 1 : 0) || a.codigo.localeCompare(b.codigo, "es"));
  }, [snap.resultados, snap.carreras, perfiles, nombres, esAdmin, misCarreras]);

  const cambiosNombres = snap.carreras.length || Object.keys(nombres).length
    ? filas.filter((x) => (nombres[x.codigo] ?? "") !== (snap.carreras.find((c) => c.codigo === x.codigo)?.nombre ?? "")) : [];
  const sinPerfil = filas.filter((x) => x.total > 0 && !x.k);
  const aCargo = (codigo: string) => coordinadores.filter((p) => (p.carreras ?? []).some((c) => normText(c) === normText(codigo)));
  const toggleCoord = async (p: Profile, codigo: string) => {
    const tiene = (p.carreras ?? []).some((c) => normText(c) === normText(codigo));
    const carreras = tiene ? (p.carreras ?? []).filter((c) => normText(c) !== normText(codigo)) : [...(p.carreras ?? []), codigo];
    try { await api.updateProfile(p.id, { carreras }); await refresh(); }
    catch (e) { toast(/carreras/i.test((e as Error).message) ? "Falta ejecutar supabase/migrations/007_perfiles_carrera.sql en Supabase." : (e as Error).message, "error"); }
  };

  return (
    <section className="card pad">
      <div className="card-h"><h3>Carreras y perfiles</h3>
        {esAdmin && cambiosNombres.length > 0 && <button className="btn primary sm" onClick={async () => {
          try { await api.upsertCarreras(cambiosNombres.map((x) => ({ codigo: x.codigo, nombre: (nombres[x.codigo] ?? "").trim() }))); await refresh(); toast("Nombres guardados"); }
          catch (e) { toast((e as Error).message, "error"); } }}>Guardar nombres</button>}</div>
      <p className="muted small">Cada carrera reparte <b>100 puntos</b> entre las 24 competencias: así se calcula el <b>CRR</b> de sus estudiantes. Marca con ★ las que más importan y el reparto se hace solo; luego puedes ajustar cada valor. Las de riesgo (↓) cuentan al revés: menos es mejor.
        {!esAdmin && " Solo ves las carreras que administración te asignó."}</p>
      {snap.perfilesListos === false && <p className="note small">Para guardar perfiles y asignar coordinadores falta ejecutar <code>supabase/migrations/007_perfiles_carrera.sql</code> en Supabase. Mientras tanto se usan los perfiles de partida.</p>}
      {!esAdmin && !filas.length && <p className="note small">Administración aún no te asignó carreras. Cuando lo haga, aquí podrás ajustar su ponderación.</p>}
      {esAdmin && sinPerfil.length > 0 && <p className="note small">{plural(sinPerfil.length, "carrera no tiene", "carreras no tienen")} perfil: {sinPerfil.map((x) => x.codigo).join(", ")}. Sus estudiantes usan el índice general.</p>}

      <div className="perfiles">
        {filas.map(({ codigo, total, k }) => {
          const p = k ? perfiles[k] : null;
          const propio = k === normText(codigo);
          const open = abierto === codigo;
          const resp = aCargo(codigo);
          const puede = esAdmin || (k ? misCarreras.has(k) : misCarreras.has(normText(codigo)));
          return (
            <div className={"perfil" + (open ? " open" : "") + (!p && total ? " sin" : "")} key={codigo}>
              <div className="perfil-h">
                <b className="perfil-cod">{codigo.length > 8 ? codigo.slice(0, 8) + "…" : codigo}</b>
                {esAdmin ? <input className="perfil-nom" value={nombres[codigo] ?? ""} placeholder={p?.nombre || "Nombre de la carrera"} onChange={(e) => setNombres({ ...nombres, [codigo]: e.target.value })} aria-label={`Nombre de ${codigo}`} />
                  : <span className="perfil-nom-ro">{nombres[codigo] || p?.nombre || codigo}</span>}
                <span className="muted small perfil-n">{total ? plural(total, "estudiante", "estudiantes") : "sin estudiantes"}</span>
                <button type="button" className="perfil-claves" onClick={() => setAbierto(open ? null : codigo)} aria-expanded={open} title="Ver o cambiar su ponderación">
                  {p ? <>{!propio && <span className="pf">usa {k}</span>}{p.claves.map((c) => <span key={c} className="clave">★ {metricName(c)}</span>)}
                    {p.modo === "manual" && <span className="pf">manual</span>}</>
                    : <span className="pf warn">Sin perfil{puede ? " · crear" : ""}</span>}
                  <Icon name="chevron" size={14} />
                </button>
              </div>
              {open && (
                <div className="perfil-body">
                  {esAdmin && (
                    <div className="resp">
                      <span className="muted small">Coordinadores a cargo (pueden editar esta ponderación):</span>
                      {coordinadores.map((c) => { const on = resp.includes(c); return (
                        <button type="button" key={c.id} className={"pchip" + (on ? " on" : "")} onClick={() => toggleCoord(c, codigo)}><Avatar name={c.nombre} size={18} /><span>{c.nombre}</span>{on && <Icon name="check" size={12} />}</button>); })}
                      {!coordinadores.length && <span className="muted small">No hay coordinadores todavía.</span>}
                    </div>
                  )}
                  {!esAdmin && resp.length > 0 && <p className="muted small">A cargo: {resp.map((c) => c.nombre).join(", ")}</p>}
                  {p && !propio && (
                    <p className="small">Usa el perfil de <b>{k}</b> ({p.nombre}). {puede && <button type="button" className="link small" onClick={() => setAbierto(codigo + "§nuevo")}>Darle uno propio</button>}</p>
                  )}
                  {!p && puede
                    ? <EditorPesos codigo={normText(codigo)} inicial={nuevoPerfil(nombres[codigo] || codigo, [], PCT_CLAVES_BASE)} nuevo puede={puede} onListo={() => setAbierto(null)} />
                    : p && <EditorPesos codigo={k!} inicial={p} puede={puede && (propio || esAdmin || misCarreras.has(k!))} onListo={() => setAbierto(null)} />}
                  {!p && !puede && <p className="muted small">Sin perfil: sus estudiantes usan el índice general.</p>}
                </div>
              )}
              {abierto === codigo + "§nuevo" && (
                <div className="perfil-body"><EditorPesos codigo={normText(codigo)} inicial={nuevoPerfil(nombres[codigo] || codigo, p?.claves ?? [], p?.pctClaves ?? PCT_CLAVES_BASE)} nuevo puede={puede} onListo={() => setAbierto(null)} /></div>
              )}
            </div>
          );
        })}
      </div>
      {esAdmin && snap.perfilesListos !== false && !snap.perfiles.length && (
        <p className="muted tiny">Aún no se ha guardado ningún perfil: se usan los de partida ({Object.keys(PERFILES_BASE).join(", ")}). Al guardar uno, queda registrado quién lo cambió y cuándo.</p>
      )}
    </section>
  );
}

/* ---------- Tabla de ponderación de una carrera ---------- */
function EditorPesos({ codigo, inicial, nuevo, puede, onListo }: { codigo: string; inicial: Perfil; nuevo?: boolean; puede: boolean; onListo(): void }) {
  const { snap, rowsByClase, api, refresh, toast, person } = useApp();
  const [p, setP] = useState<Perfil>(() => JSON.parse(JSON.stringify(inicial)));
  const [busy, setBusy] = useState(false);
  const total = totalPesos(p.pesos);
  const ok = Math.abs(total - 100) < 0.05;
  const cambiado = nuevo || JSON.stringify(p) !== JSON.stringify(inicial);
  const k = (m: string) => normText(m);
  const esClave = (m: string) => p.claves.some((c) => k(c) === k(m));

  const toggle = (m: string) => {
    const claves = esClave(m) ? p.claves.filter((c) => k(c) !== k(m)) : [...p.claves, m];
    setP({ ...p, claves, pesos: p.modo === "auto" ? repartir(claves, p.pctClaves) : p.pesos });
  };
  const setPct = (v: number) => setP({ ...p, pctClaves: v, modo: "auto", pesos: repartir(p.claves, v) });
  const setPeso = (m: string, v: number) => setP({ ...p, modo: "manual", pesos: { ...p.pesos, [k(m)]: Math.max(0, Math.min(100, Math.round(v * 10) / 10)) } });

  // vista previa: CRR medio de los estudiantes de esta carrera antes y después de los cambios
  const impacto = useMemo(() => {
    const filas = [...rowsByClase.values()].flat().filter((r) => codigoPerfil(r.r.carrera, r.carrera) === codigo || (nuevo && normText(r.r.carrera) === codigo));
    if (!filas.length) return null;
    const vac = new Map<string, Set<string>>();
    const despues = filas.map((r) => {
      if (!vac.has(r.cls.id)) vac.set(r.cls.id, vaciasDe(r.cls.metrics, (rowsByClase.get(r.cls.id) ?? []).map((x) => x.r.valores)));
      return crrPonderado(r.cls.metrics, r.r.valores, p.pesos, vac.get(r.cls.id)) ?? indiceGeneral(r.cls.metrics, r.r.valores, vac.get(r.cls.id));
    });
    return { n: filas.length, antes: mean(filas.map((r) => r.indice)), despues: mean(despues), general: mean(filas.map((r) => r.general)) };
  }, [rowsByClase, codigo, p.pesos, nuevo]);

  const guardar = async () => {
    setBusy(true);
    try { await api.savePerfil({ ...aFila(codigo, p), nombre: p.nombre || codigo }); await refresh(); toast(`Ponderación de ${codigo} guardada`); onListo(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const quitar = async () => {
    if (!confirm(`¿Quitar el perfil de ${codigo}? Sus estudiantes pasarán a usar el índice general.`)) return;
    try { await api.deletePerfil(codigo); await refresh(); toast(`Perfil de ${codigo} quitado`); onListo(); } catch (e) { toast((e as Error).message, "error"); }
  };

  const fila = (m: string) => {
    const v = p.pesos[k(m)] ?? 0;
    return (
      <div className={"pw-row" + (esClave(m) ? " pw-key" : "")} key={m}>
        <button type="button" className={"pw-star" + (esClave(m) ? " on" : "")} disabled={!puede} onClick={() => toggle(m)} aria-label={esClave(m) ? "Quitar de las claves" : "Marcar como clave"} title={esClave(m) ? "Clave: recibe más peso" : "Marcar como clave"}>★</button>
        <span className={"pw-n" + (isRisk(m) ? " risk" : "")} title={metricDesc(m)}>{metricName(m)}{isRisk(m) ? " ↓" : ""}</span>
        <span className="pw-bar"><i style={{ width: Math.min(100, v * 4) + "%" }} /></span>
        <input type="number" min={0} max={100} step={0.5} value={v} disabled={!puede} onChange={(e) => setPeso(m, Number(e.target.value))} aria-label={`Puntos de ${metricName(m)}`} />
      </div>
    );
  };

  return (
    <div className="pw">
      <div className="pw-top">
        <div className={"pw-total" + (ok ? " ok" : " bad")}><b>{fmt(total)}</b><small>de 100 puntos</small></div>
        <label className="pw-pct">
          <span>Las ★ claves reciben</span>
          <input type="range" min={10} max={80} step={5} value={p.pctClaves} disabled={!puede || !p.claves.length} onChange={(e) => setPct(Number(e.target.value))} />
          <b>{p.pctClaves} %</b>
        </label>
        <span className={"pf" + (p.modo === "manual" ? " warn" : "")}>{p.modo === "auto" ? "Reparto automático" : "Ajustado a mano"}</span>
      </div>
      {puede && (
        <div className="row-gap wrap pw-acts">
          <button type="button" className="btn ghost sm" onClick={() => setP({ ...p, modo: "auto", pesos: repartir(p.claves, p.pctClaves) })}>Repartir automáticamente</button>
          <button type="button" className="btn ghost sm" onClick={() => setP({ ...p, modo: "manual", pesos: repartirIgual() })}>Partes iguales</button>
          {!ok && <button type="button" className="btn ghost sm" onClick={() => setP({ ...p, modo: "manual", pesos: aCien(p.pesos) })}>Ajustar a 100</button>}
          <span className="muted small">{p.claves.length ? `${p.claves.length} claves · ${fmt((p.pctClaves) / Math.max(1, p.claves.length))} pts cada una` : "Marca con ★ las competencias clave"}</span>
        </div>
      )}
      <div className="pw-grid">
        <div><h5 className="sub-h">Competencias</h5>{COMPETENCIAS.filter((m) => !isRisk(m)).map(fila)}</div>
        <div><h5 className="sub-h">De riesgo (↓, cuentan invertidas)</h5>{COMPETENCIAS.filter(isRisk).map(fila)}</div>
      </div>
      {impacto && (
        <p className="pw-impacto small">CRR promedio de sus {plural(impacto.n, "estudiante", "estudiantes")}: <b>{fmt(impacto.antes)}</b>{cambiado && <> → <b className={impacto.despues! >= impacto.antes! ? "pos" : "neg"}>{fmt(impacto.despues)}</b></>}
          <span className="muted"> · índice general sin ponderar {fmt(impacto.general)}</span></p>
      )}
      {inicial.actualizadoEn && !nuevo && <p className="muted tiny">Última modificación: {person(inicial.actualizadoPor)?.nombre ?? "—"} · {new Date(inicial.actualizadoEn).toLocaleString("es")}</p>}
      {puede && (
        <div className="row-gap wrap">
          <button className="btn primary sm" disabled={!ok || busy || !cambiado} onClick={guardar}>{busy ? <span className="spinner" /> : nuevo ? "Crear perfil" : "Guardar ponderación"}</button>
          {!ok && <span className="neg small">El total debe ser 100.</span>}
          {!nuevo && snap.perfiles.some((x) => normText(x.codigo) === codigo) && <button type="button" className="link small danger" onClick={quitar}><Icon name="trash" size={13} /> Quitar perfil</button>}
          <button type="button" className="btn ghost sm" onClick={onListo}>Cerrar</button>
        </div>
      )}
    </div>
  );
}
