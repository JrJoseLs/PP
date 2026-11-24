/* Asignación rápida de clases (Equipo → Acceso a clases).
   Pensada para muchas clases y muchas personas:
   1. Buscar/filtrar clases, seleccionar varias y dar, quitar o reemplazar el acceso a una o varias personas.
   2. Sugerencias: los nombres de clase suelen empezar por las iniciales del docente («JRav-ADM535-1593GR» → J. Ravelo).
   3. Importar desde Excel: columnas Clase + Usuario (o correo o nombre), con vista previa.
   Nada se aplica sin confirmar; cada cambio respeta los permisos (la base de datos los vuelve a comprobar). */
import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Avatar, Icon, Segmented } from "./ui";
import { D, M, cargoDe, low } from "../lib/labels";
import { normText, plural } from "../lib/metrics";
import { readBook } from "../lib/parse";
import type { Clase, Profile } from "../lib/types";

type Nivel = "decano" | "maestro";
const lista = (c: Clase, n: Nivel) => (n === "decano" ? c.decanos : c.maestros);

/** Prefijo del nombre de la clase que suele identificar al docente: «JRav-ADM535-1593GR» → «jrav» */
const prefijo = (nombre: string) => nombre.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,7})[-_]/)?.[1].toLowerCase() ?? "";
/** Claves con las que una persona podría aparecer en ese prefijo: inicial + 3 letras de un apellido, o su usuario */
function clavesDe(p: Profile) {
  const w = normText(p.nombre.replace(/^(dra?|mtro|mtra|lic|ing)\.?\s+/i, "")).toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 1; i < w.length; i++) for (const n of [3, 4]) out.add(w[0][0] + w[i].slice(0, n));
  if (w.length > 2) out.add(w[0][0] + w[1][0] + w[2].slice(0, 2));
  const u = normText(p.usuario).toLowerCase().replace(/[^a-z]/g, "");
  if (u.length >= 3) { out.add(u); out.add(u.slice(0, 4)); }
  return out;
}

export function AsignacionRapida() {
  const { snap, user, api, refresh, toast } = useApp();
  const rol = user!.rol;
  const [nivel, setNivel] = useState<Nivel>(rol === "admin" ? "decano" : "maestro");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "sin" | "con">("todas");
  const [periodo, setPeriodo] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [quien, setQuien] = useState<Set<string>>(new Set());
  const [qp, setQp] = useState("");
  const [busy, setBusy] = useState(false);
  const [importado, setImportado] = useState<{ clase: Clase; p: Profile }[] | null>(null);
  const [noEncontrados, setNoEncontrados] = useState<string[]>([]);

  const gente = useMemo(() => snap.profiles.filter((p) => p.activo && p.rol === nivel && (rol === "admin" || p.decano_id === user!.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [snap.profiles, nivel, rol, user]);
  const porId = new Map(snap.profiles.map((p) => [p.id, p]));
  const periodos = [...new Set(snap.clases.map((c) => c.periodo).filter(Boolean))].sort().reverse();
  const n = normText(q);
  const clases = snap.clases.filter((c) =>
    (!n || normText([c.nombre, c.grupo, c.periodo, c.archivo ?? ""].join(" ")).includes(n)) &&
    (!periodo || c.periodo === periodo) &&
    (filtro === "todas" || (filtro === "sin" ? !lista(c, nivel).length : lista(c, nivel).length > 0)));
  const todasSel = clases.length > 0 && clases.every((c) => sel.has(c.id));
  const np = normText(qp);
  const genteVista = gente.filter((p) => !np || normText(p.nombre + " " + p.usuario).includes(np));

  /* sugerencias por iniciales en el nombre de la clase: solo si coincide UNA persona y aún no la tiene */
  const sugerencias = useMemo(() => {
    const claves = gente.map((p) => ({ p, k: clavesDe(p) }));
    return snap.clases.flatMap((c) => {
      const pre = prefijo(c.nombre);
      if (!pre) return [];
      const m = claves.filter((x) => x.k.has(pre));
      return m.length === 1 && !lista(c, nivel).includes(m[0].p.id) ? [{ clase: c, p: m[0].p }] : [];
    });
  }, [snap.clases, gente, nivel]);

  /** Aplica cambios de acceso clase por clase (en tandas, para ir rápido sin saturar) */
  const aplicar = async (cambios: { c: Clase; ids: string[] }[], ok: string) => {
    setBusy(true);
    let hechos = 0;
    try {
      for (let i = 0; i < cambios.length; i += 6) {
        await Promise.all(cambios.slice(i, i + 6).map(({ c, ids }) => (nivel === "decano" ? api.setClaseDecanos(c.id, ids) : api.setClaseMaestros(c.id, ids)).then(() => { hechos++; })));
      }
      toast(ok);
    } catch (e) { toast(`${plural(hechos, "clase actualizada", "clases actualizadas")}; luego falló: ${(e as Error).message}`, "error"); }
    await refresh();
    setBusy(false);
  };
  const enLote = (modo: "dar" | "quitar" | "reemplazar") => {
    const ps = [...quien];
    const cs = snap.clases.filter((c) => sel.has(c.id));
    const cambios = cs.map((c) => {
      const actual = lista(c, nivel);
      const ids = modo === "dar" ? [...new Set([...actual, ...ps])] : modo === "quitar" ? actual.filter((x) => !ps.includes(x)) : ps;
      return { c, ids };
    }).filter(({ c, ids }) => JSON.stringify([...ids].sort()) !== JSON.stringify([...lista(c, nivel)].sort()));
    if (!cambios.length) { toast("No hay nada que cambiar en esas clases."); return; }
    if (modo === "reemplazar" && !confirm(`Se quitará a cualquier otra persona de ${plural(cambios.length, "clase", "clases")}. ¿Continuar?`)) return;
    aplicar(cambios, `${plural(cambios.length, "clase actualizada", "clases actualizadas")}`).then(() => setSel(new Set()));
  };
  const aplicarPares = (pares: { clase: Clase; p: Profile }[], ok: string) => {
    const porClase = new Map<string, Set<string>>();
    pares.forEach(({ clase, p }) => porClase.set(clase.id, new Set([...(porClase.get(clase.id) ?? lista(clase, nivel)), p.id])));
    return aplicar([...porClase].map(([id, s]) => ({ c: snap.clases.find((x) => x.id === id)!, ids: [...s] })), ok);
  };

  /* Excel: una fila por asignación (Clase + Usuario, correo o nombre) */
  const leerExcel = async (file: File) => {
    try {
      const book = await readBook(file);
      const filas = Object.values(book).find((r) => r.some((x) => (x ?? []).some((v) => /^CLASE/.test(normText(v))))) ?? Object.values(book)[0] ?? [];
      const h = filas.findIndex((r) => (r ?? []).some((v) => /^CLASE/.test(normText(v))));
      if (h < 0) { toast("No encontré una columna «Clase».", "error"); return; }
      const head = filas[h].map((v) => normText(v));
      const cC = head.findIndex((v) => /^CLASE/.test(v));
      const cP = head.findIndex((v) => /USUARIO|CORREO|EMAIL|NOMBRE|DOCENTE|DIRECTOR|COORDINADOR|PERSONA|RESPONSABLE/.test(v) && !/^CLASE/.test(v));
      if (cP < 0) { toast("No encontré la columna de la persona (Usuario, correo o nombre).", "error"); return; }
      const out: { clase: Clase; p: Profile }[] = [], faltan: string[] = [];
      for (const r of filas.slice(h + 1)) {
        const cn = normText(r?.[cC]), pn = normText(r?.[cP]);
        if (!cn || !pn) continue;
        const clase = snap.clases.find((c) => normText(c.nombre) === cn);
        const p = gente.find((x) => normText(x.usuario) === pn || normText(x.nombre) === pn || normText(x.usuario.split("@")[0]) === pn.split(" ")[0]);
        if (clase && p) out.push({ clase, p }); else faltan.push(`${String(r?.[cC] ?? "")} → ${String(r?.[cP] ?? "")}${!clase ? " (clase no encontrada)" : ` (no hay ${low((nivel === "decano" ? D() : M()).one)} con ese usuario)`}`);
      }
      setImportado(out); setNoEncontrados(faltan);
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="asig">
      {rol === "admin" && <div className="toolbar"><Segmented size="sm" value={nivel} onChange={(v) => { setNivel(v); setQuien(new Set()); }}
        options={[{ value: "decano", label: `Asignar ${low(D().many)}` }, { value: "maestro", label: `Asignar ${low(M().many)}` }]} /></div>}

      {sugerencias.length > 0 && (
        <div className="card pad asig-sug">
          <div className="card-h"><h3><Icon name="bolt" size={16} /> Sugerencias por el nombre de la clase</h3>
            <button className="btn primary sm" disabled={busy} onClick={() => aplicarPares(sugerencias, `${plural(sugerencias.length, "sugerencia aplicada", "sugerencias aplicadas")}`)}>Aplicar {sugerencias.length}</button></div>
          <p className="muted small">Las clases empiezan con las iniciales de la persona (p. ej. «JRav-…» → J. Ravelo). Revisa la lista antes de aplicar.</p>
          <div className="asig-sug-list">{sugerencias.slice(0, 40).map(({ clase, p }) => (
            <span key={clase.id} className="asig-par"><b>{clase.nombre}</b> → {p.nombre}</span>))}
            {sugerencias.length > 40 && <span className="muted small">y {sugerencias.length - 40} más…</span>}</div>
        </div>
      )}

      <div className="asig-grid">
        <section className="card pad">
          <div className="card-h"><h3>1 · Clases</h3><span className="muted small">{sel.size ? plural(sel.size, "seleccionada", "seleccionadas") : `${clases.length} de ${snap.clases.length}`}</span></div>
          <div className="asig-tools">
            <label className="search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar clase, grupo, archivo…" /></label>
            {periodos.length > 1 && <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}><option value="">Todo período</option>{periodos.map((x) => <option key={x}>{x}</option>)}</select>}
            <Segmented size="sm" value={filtro} onChange={setFiltro} options={[{ value: "todas", label: "Todas" }, { value: "sin", label: "Sin asignar" }, { value: "con", label: "Asignadas" }]} />
          </div>
          <label className="asig-all"><input type="checkbox" checked={todasSel} onChange={() => {
            const s = new Set(sel); clases.forEach((c) => (todasSel ? s.delete(c.id) : s.add(c.id))); setSel(s); }} /> Seleccionar {todasSel ? "ninguna" : `las ${clases.length} que se ven`}</label>
          <div className="asig-list">
            {clases.map((c) => {
              const ps = lista(c, nivel).map((id) => porId.get(id)).filter((x): x is Profile => !!x);
              return (
                <label key={c.id} className={"asig-row" + (sel.has(c.id) ? " on" : "")}>
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => { const s = new Set(sel); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); setSel(s); }} />
                  <span className="dot" style={{ background: c.color }} />
                  <span className="asig-n">{c.nombre}{c.periodo && <small className="muted"> · {c.periodo}</small>}</span>
                  <span className="asig-who">{ps.length ? ps.map((p) => p.nombre.split(" ").slice(0, 2).join(" ")).join(", ") : <span className="falta">Sin asignar</span>}</span>
                </label>
              );
            })}
            {!clases.length && <p className="muted small">Ninguna clase coincide.</p>}
          </div>
        </section>

        <section className="card pad asig-side">
          <div className="card-h"><h3>2 · Personas</h3><span className="muted small">{quien.size ? plural(quien.size, "elegida", "elegidas") : ""}</span></div>
          <label className="search"><Icon name="search" size={15} /><input value={qp} onChange={(e) => setQp(e.target.value)} placeholder={`Buscar ${low((nivel === "decano" ? D() : M()).one)}…`} /></label>
          <div className="asig-people">
            {genteVista.map((p) => {
              const on = quien.has(p.id);
              const cuantas = snap.clases.filter((c) => lista(c, nivel).includes(p.id)).length;
              return (
                <button type="button" key={p.id} className={"asig-p" + (on ? " on" : "")} onClick={() => { const s = new Set(quien); if (on) s.delete(p.id); else s.add(p.id); setQuien(s); }}>
                  <Avatar name={p.nombre} size={24} /><span className="rank-txt"><b>{p.nombre}</b><small>{cargoDe(p)} · {plural(cuantas, "clase", "clases")}</small></span>{on && <Icon name="check" size={15} />}
                </button>
              );
            })}
            {!genteVista.length && <p className="muted small">No hay personas en este nivel.</p>}
          </div>
          <div className="asig-acts">
            <span className="small">{sel.size && quien.size ? <>{plural(sel.size, "clase", "clases")} × {plural(quien.size, "persona", "personas")}</> : <span className="muted">Elige clases y personas</span>}</span>
            <button className="btn primary sm" disabled={busy || !sel.size || !quien.size} onClick={() => enLote("dar")}>{busy ? <span className="spinner" /> : "Dar acceso"}</button>
            <button className="btn sm" disabled={busy || !sel.size || !quien.size} onClick={() => enLote("quitar")}>Quitar</button>
            <button className="btn ghost sm" disabled={busy || !sel.size || !quien.size} onClick={() => enLote("reemplazar")} title="Deja SOLO a las personas elegidas en esas clases">Reemplazar</button>
          </div>
        </section>
      </div>

      <section className="card pad">
        <div className="card-h"><h3><Icon name="upload" size={16} /> Desde Excel</h3>
          <label className="btn sm"><Icon name="upload" size={14} /> Subir Excel<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) leerExcel(f); e.target.value = ""; }} /></label></div>
        <p className="muted small">Una fila por asignación con dos columnas: <b>Clase</b> (nombre exacto) y <b>Usuario</b> (también vale correo o nombre completo). Se asigna al nivel elegido arriba ({low((nivel === "decano" ? D() : M()).many)}).</p>
        {importado && <>
          <p className="small"><b>{plural(importado.length, "asignación lista", "asignaciones listas")}</b>{noEncontrados.length ? ` · ${noEncontrados.length} con problemas` : ""}</p>
          {noEncontrados.length > 0 && <ul className="asig-err">{noEncontrados.slice(0, 12).map((x) => <li key={x}>{x}</li>)}{noEncontrados.length > 12 && <li>y {noEncontrados.length - 12} más…</li>}</ul>}
          <div className="row-gap">
            <button className="btn primary sm" disabled={busy || !importado.length} onClick={() => aplicarPares(importado, `${plural(importado.length, "asignación aplicada", "asignaciones aplicadas")}`).then(() => setImportado(null))}>Aplicar</button>
            <button className="btn ghost sm" onClick={() => { setImportado(null); setNoEncontrados([]); }}>Descartar</button>
          </div>
        </>}
      </section>
    </div>
  );
}
