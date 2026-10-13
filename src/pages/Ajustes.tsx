import { useMemo, useState } from "react";
import { useApp } from "../data/store";
import { Avatar, Icon, Segmented } from "../components/ui";
import { useTheme, type ThemePref } from "../components/Theme";
import { D, M, ROLE_PRESETS, low, metricDefaultName, metricDesc, metricOverridesRaw, roleNames, rolLabel, type RoleNames } from "../lib/labels";
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
            <div><h3>{user!.nombre}</h3><p className="muted">@{user!.usuario} · {rolLabel(user!.rol)}</p></div></div>
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

        {user!.rol === "admin" && <RoleNamesEditor />}
        {user!.rol === "admin" && <MetricNamesEditor />}

        <section className="card pad">
          <h3>Qué puede ver cada rol</h3>
          <ul className="roles">
            <li><b>Administración</b> carga las clases desde Excel, crea cuentas y entrega cada clase a uno o más {low(D().many)}.</li>
            <li><b>{D().one}</b> ve solo las clases que se le entregaron y solo a sus {low(M().many)}. Decide qué clase ve cada uno y compara clases, personas y carreras.</li>
            <li><b>{M().one}</b> ve solo las clases que su {low(D().one)} le asignó: sus estudiantes, perfiles y comparaciones dentro de ellas.</li>
          </ul>
          <p className="muted small">{api.mode === "cloud" ? "Estas reglas se aplican en el servidor (Row Level Security de Postgres): la base de datos no entrega información fuera de tu alcance." : "En modo demo las mismas reglas se simulan en tu navegador."}</p>
        </section>

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

/* ---------- Nombres de los roles (solo administración) ---------- */
function RoleNamesEditor() {
  const { run } = useApp();
  const [f, setF] = useState<RoleNames>(() => JSON.parse(JSON.stringify(roleNames())));
  const same = (a: RoleNames, b: RoleNames) => JSON.stringify(a) === JSON.stringify(b);
  const preset = ROLE_PRESETS.find((p) => same(p.names, f))?.id ?? "custom";
  const dirty = !same(f, roleNames());
  const set = (r: "decano" | "maestro", k: "one" | "many", v: string) => setF({ ...f, [r]: { ...f[r], [k]: v } });

  return (
    <section className="card pad">
      <h3>Nombres de los roles</h3>
      <p className="muted small">Solo cambia cómo se llaman en pantalla. Los permisos siguen iguales: el primer rol reparte clases a su equipo; el segundo solo ve las clases que le asignan.</p>
      <div className="presets">
        {ROLE_PRESETS.map((p) => (
          <button key={p.id} type="button" className={"preset" + (preset === p.id ? " on" : "")} onClick={() => setF(JSON.parse(JSON.stringify(p.names)))}>
            <b>{p.titulo}</b><small>{p.nota}</small>
          </button>
        ))}
        <div className={"preset static" + (preset === "custom" ? " on" : "")}><b>Personalizado</b><small>Escribe tus propios nombres abajo</small></div>
      </div>
      <div className="role-grid">
        <span />
        <span className="muted tiny">Singular</span>
        <span className="muted tiny">Plural</span>
        <span className="small"><b>Reparte clases</b><br /><span className="muted tiny">(antes: decano)</span></span>
        <input value={f.decano.one} onChange={(e) => set("decano", "one", e.target.value)} placeholder="Supervisor/a" />
        <input value={f.decano.many} onChange={(e) => set("decano", "many", e.target.value)} placeholder="Supervisores" />
        <span className="small"><b>Consulta sus clases</b><br /><span className="muted tiny">(antes: maestro)</span></span>
        <input value={f.maestro.one} onChange={(e) => set("maestro", "one", e.target.value)} placeholder="Colaborador/a" />
        <input value={f.maestro.many} onChange={(e) => set("maestro", "many", e.target.value)} placeholder="Colaboradores" />
      </div>
      <p className="muted small">Así se verá: “Todos los {low(f.decano.many || "…")}”, “Nuevo {low(f.maestro.one || "…")}”, “Sin {low(f.decano.one || "…")}”.</p>
      <button className="btn primary" disabled={!dirty} onClick={() => run((a) => a.setAjuste("roles", f), "Nombres de roles guardados")}>Guardar nombres</button>
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
