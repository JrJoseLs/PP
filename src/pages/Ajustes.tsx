import { useState } from "react";
import { useApp } from "../data/store";
import { Avatar, Icon, Segmented } from "../components/ui";
import { useTheme, type ThemePref } from "../components/Theme";
import { ROL_LABEL } from "../lib/types";
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
            <div><h3>{user!.nombre}</h3><p className="muted">@{user!.usuario} · {ROL_LABEL[user!.rol]}</p></div></div>
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

        <section className="card pad">
          <h3>Qué puede ver cada rol</h3>
          <ul className="roles">
            <li><b>Administración</b> carga las clases desde Excel, crea cuentas y entrega cada clase a uno o más decanos.</li>
            <li><b>Decano/a</b> ve solo las clases que se le entregaron y solo a sus maestros. Decide qué clase ve cada maestro y compara clases, maestros y carreras.</li>
            <li><b>Maestro/a</b> ve solo las clases que su decano le asignó: sus estudiantes, perfiles y comparaciones dentro de ellas.</li>
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
