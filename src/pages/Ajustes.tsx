import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Avatar, Icon, Segmented } from "../components/ui";
import { useTheme, type ThemePref } from "../components/Theme";
import { NIVELES, cargoDe, cargosList, metricDefaultName, metricDesc, metricOverridesRaw } from "../lib/labels";
import type { Profile, Rol } from "../lib/types";
import { METRICS_FALLBACK, isRisk, normText } from "../lib/metrics";
import { cloudConfigured } from "../data/api";
import { PageHead } from "./Dashboard";

export default function Ajustes() {
  const { user, api, run } = useApp();
  const [pref, setPref] = useTheme();
  const [pw, setPw] = useState({ a: "", b: "" });
  const [err, setErr] = useState("");

  return (
    <>
      <PageHead title="Ajustes" />
      <div className="settings">
        <section className="card pad">
          <div className="row-gap"><Avatar name={user!.nombre} size={56} />
            <div><h3>{user!.nombre}</h3><p className="muted">@{user!.usuario} · {cargoDe(user!)}</p></div></div>
        </section>

        <section className="card pad">
          <h3>Apariencia</h3>
          <Segmented value={pref} onChange={(v: ThemePref) => setPref(v)} options={[{ value: "system", label: "Automático" }, { value: "light", label: "Claro" }, { value: "dark", label: "Oscuro" }]} />
        </section>

        <section className="card pad">
          <h3>Cambiar contraseña</h3>
          <form className="form" onSubmit={async (e) => {
            e.preventDefault(); setErr("");
            if (pw.a.length < 8) return setErr("Mínimo 8 caracteres.");
            if (pw.a !== pw.b) return setErr("Las contraseñas no coinciden.");
            if (await run((a) => a.changeMyPassword(pw.a), "Contraseña actualizada") !== false) setPw({ a: "", b: "" });
          }}>
            <div className="grid2 tight">
              <label className="field"><span>Nueva contraseña</span><input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></label>
              <label className="field"><span>Repítela</span><input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></label>
            </div>
            {err && <div className="form-err">{err}</div>}
            <div><button className="btn primary">Actualizar</button></div>
          </form>
        </section>

        {user!.rol === "admin" && <CargosEditor />}
        {user!.rol === "admin" && <MetricNamesEditor />}

        {user!.rol !== "admin" && <section className="card pad">
          <h3>Qué puede ver cada cargo</h3>
          <ul className="roles">
            {(["admin", "decano", "maestro"] as Rol[]).map((rr) => (
              <li key={rr}><b>{cargosList().filter((c) => c.rol === rr).map((c) => c.label).join(" · ") || NIVELES[rr].titulo}</b>: {NIVELES[rr].nota.toLowerCase()}.</li>
            ))}
          </ul>
          <p className="muted small">{api.mode === "cloud" ? "Estas reglas se aplican en el servidor (Row Level Security de Postgres): la base de datos no entrega información fuera de tu alcance." : "En modo demo las mismas reglas se simulan en tu navegador."}</p>
        </section>}

        <section className="card pad">
          <h3>Atajos</h3>
          <ul className="kbd-list">
            <li><kbd>⌘</kbd><kbd>K</kbd> o <kbd>/</kbd><span>Buscar estudiantes, clases y personas</span></li>
            <li><kbd>Esc</kbd><span>Cerrar paneles</span></li>
          </ul>
        </section>

        <section className="card pad">
          <h3><Icon name={api.mode === "cloud" ? "cloud" : "bolt"} size={18} /> Conexión</h3>
          {api.mode === "cloud"
            ? <p>Conectado a la base de datos en la nube (Supabase).</p>
            : <>
              <p><b>Modo demostración.</b> Los datos son de ejemplo y viven solo en este navegador.</p>
              <div className="row-gap wrap">
                <button className="btn" onClick={async () => { if (!confirm("¿Restaurar los datos de ejemplo? Se pierden los cambios hechos en la demo.")) return;
                  const { DemoApi } = await import("../data/demoApi"); DemoApi.reset(); location.reload(); }}>Restaurar datos de ejemplo</button>
                {cloudConfigured && <button className="btn" onClick={() => { sessionStorage.removeItem("pp_force_demo"); location.href = location.pathname; }}>Volver a la nube</button>}
              </div>
              <p className="muted small">Para usar datos reales, conecta Supabase siguiendo el README del repositorio.</p>
            </>}
        </section>
      </div>
    </>
  );
}


/* ---------- Cargos y permisos (solo administración) ----------
   Una sola tarjeta, ordenada por nivel de acceso: qué permite cada nivel y qué cargos lo tienen.
   Al renombrar un cargo o moverlo de nivel, se actualiza a las personas que lo tienen. */
function CargosEditor() {
  const { run, snap, user, api, refresh, toast } = useApp();
  type Fila = { id: number; label: string; rol: Rol; orig?: string; origRol?: Rol };
  const inicial = () => cargosList().map((c, id) => ({ id, ...c, orig: c.label, origRol: c.rol }));
  const [f, setF] = useState<Fila[]>(inicial);
  const [busy, setBusy] = useState(false);
  const usan = (label?: string) => (label ? snap.profiles.filter((p) => cargoDe(p) === label) : []);
  const dirty = JSON.stringify(f.map(({ label, rol }) => ({ label: label.trim(), rol }))) !== JSON.stringify(cargosList());
  const nombres = f.map((c) => c.label.trim().toLowerCase());
  const NIV: Rol[] = ["admin", "decano", "maestro"];
  const error = f.some((c) => !c.label.trim()) ? "Hay un cargo sin nombre."
    : nombres.some((n, i) => nombres.indexOf(n) !== i) ? "Hay dos cargos con el mismo nombre."
    : NIV.find((r) => !f.some((c) => c.rol === r)) ? `«${NIVELES[NIV.find((r) => !f.some((c) => c.rol === r))!].titulo}» necesita al menos un cargo.` : "";
  const set = (id: number, p: Partial<Fila>) => setF(f.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const save = async () => {
    setBusy(true);
    const ok = await run((a) => a.setAjuste("cargos", f.map((c) => ({ label: c.label.trim(), rol: c.rol }))));
    if (ok !== false) {
      // las personas siguen a su cargo: nuevo nombre y, si cambió de nivel, nuevo acceso
      let n = 0;
      for (const c of f) {
        if (!c.orig || (c.orig === c.label.trim() && c.origRol === c.rol)) continue;
        for (const p of usan(c.orig)) {
          const patch: Partial<Profile> = { cargo: c.label.trim() };
          if (p.rol !== c.rol) { patch.rol = c.rol; if (c.rol !== "maestro") patch.decano_id = null; }
          try { await api.updateProfile(p.id, patch); n++; } catch (e) { toast(`${p.nombre}: ${(e as Error).message}`, "error"); }
        }
      }
      await refresh();
      toast(`Cargos guardados${n ? ` · ${n} ${n === 1 ? "persona actualizada" : "personas actualizadas"}` : ""}`);
      setF(inicial());
    }
    setBusy(false);
  };

  return (
    <section className="card pad">
      <h3>Cargos y permisos</h3>
      <p className="muted small">El cargo es el nombre que ve cada persona; el nivel decide qué puede ver.</p>
      <div className="niveles">
        {NIV.map((r) => (
          <div className="nivel" key={r}>
            <div className="nivel-h"><b>{NIVELES[r].titulo}</b><span>{NIVELES[r].nota}.</span></div>
            {f.filter((c) => c.rol === r).map((c) => {
              const gente = usan(c.orig);
              const mio = gente.some((p) => p.id === user!.id);
              return (
                <div className="cargo-row" key={c.id}>
                  <input value={c.label} maxLength={60} onChange={(e) => set(c.id, { label: e.target.value })} placeholder="Nombre del cargo" aria-label="Nombre del cargo" />
                  <span className="cargo-n" title={gente.map((p) => p.nombre).join(", ")}>{gente.length || ""}</span>
                  <select className="mover" value="" disabled={mio} title={mio ? "Es tu propio cargo: no puedes quitarte el acceso" : "Cambiar el nivel de acceso de este cargo"} aria-label="Mover a otro nivel"
                    onChange={(e) => e.target.value && set(c.id, { rol: e.target.value as Rol })}>
                    <option value="">Mover a…</option>
                    {NIV.filter((x) => x !== r).map((x) => <option key={x} value={x}>{NIVELES[x].titulo}</option>)}
                  </select>
                  <button type="button" className="icon-btn" disabled={gente.length > 0 || f.filter((x) => x.rol === r).length < 2}
                    title={gente.length ? "Hay personas con este cargo" : "Quitar cargo"} onClick={() => setF(f.filter((x) => x.id !== c.id))} aria-label="Quitar cargo"><Icon name="trash" size={15} /></button>
                </div>
              );
            })}
            <button type="button" className="link small" onClick={() => setF([...f, { id: Date.now(), label: "", rol: r }])}><Icon name="plus" size={13} /> Agregar cargo</button>
          </div>
        ))}
      </div>
      {error && <div className="form-err">{error}</div>}
      {!error && f.some((c) => c.orig && c.origRol !== c.rol && usan(c.orig).length) && <p className="note small">Las personas con un cargo que cambiaste de nivel tendrán el nuevo acceso al guardar.</p>}
      {dirty && <div className="row-gap"><button className="btn primary" disabled={!!error || busy} onClick={save}>{busy ? <span className="spinner" /> : "Guardar cambios"}</button>
        <button className="btn ghost" onClick={() => setF(inicial())}>Descartar</button></div>}
    </section>
  );
}

/* ---------- Nombres de las competencias (solo administración) ---------- */
function MetricNamesEditor() {
  const { run, metrics } = useApp();
  const list = useMemo(() => (metrics.length ? metrics : METRICS_FALLBACK), [metrics]);
  const saved = metricOverridesRaw();
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(list.map((m) => [m, saved[normText(m)] ?? ""])));
  const [open, setOpen] = useState(false);
  const dirty = list.some((m) => (f[m] ?? "") !== (saved[normText(m)] ?? ""));
  const save = () => {
    const out: Record<string, string> = {};
    list.forEach((m) => { const v = (f[m] ?? "").trim(); if (v && v !== metricDefaultName(m)) out[m] = v; });
    return run((a) => a.setAjuste("competencias", out), "Nombres de competencias guardados");
  };

  return (
    <section className="card pad">
      <div className="card-h"><h3>Nombres de las competencias</h3>
        <button className="link" onClick={() => setOpen(!open)}>{open ? "Ocultar" : `Ver las ${list.length}`}</button></div>
      <p className="muted small">Los informes del juego traen traducciones literales (“Luchado”, “Retrasar”…). La plataforma ya las muestra en español académico; aquí puedes cambiar cualquiera. Los Excel se siguen leyendo con su nombre original.</p>
      {open && <>
        <div className="mnames">
          <div className="mn-row mn-h"><span>En el informe del juego</span><span>Se muestra como</span></div>
          {list.map((m) => (
            <label className="mn-row" key={m} title={metricDesc(m)}>
              <span className={isRisk(m) ? "risk" : ""}>{m}{isRisk(m) ? " ↓" : ""}<small>{metricDesc(m)}</small></span>
              <input value={f[m] ?? ""} placeholder={metricDefaultName(m)} onChange={(e) => setF({ ...f, [m]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="row-gap wrap">
          <button className="btn primary" disabled={!dirty} onClick={save}>Guardar nombres</button>
          <button className="btn" onClick={() => setF(Object.fromEntries(list.map((m) => [m, ""])))}>Usar los sugeridos</button>
          <span className="muted tiny">Deja un campo vacío para usar el nombre sugerido (en gris).</span>
        </div>
      </>}
    </section>
  );
}
