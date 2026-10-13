import { lazy, Suspense, useState } from "react";
import { useApp } from "../data/store";
import { friendlyError } from "../data/api";
import { DEMO_ACCOUNTS } from "../data/demoSeed";
import { Avatar, Icon } from "../components/ui";
import { rolLabel } from "../lib/labels";
import { ThemeButton } from "../components/Theme";

const Backdrop3D = lazy(() => import("../components/Backdrop3D"));

export default function Login() {
  const { api, setUser } = useApp();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const go = async (u = usuario, p = password) => {
    if (!u || !p) { setErr("Escribe tu usuario y contraseña."); setShake((s) => s + 1); return; }
    setBusy(true); setErr("");
    try { setUser(await api.signIn(u, p)); }
    catch (e) { setErr(friendlyError(e)); setShake((s) => s + 1); setPassword(""); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <Suspense fallback={null}><Backdrop3D /></Suspense>
      <div className="login-glow" />
      <div className="login-top"><ThemeButton /></div>
      <div className="login-grid">
        <section className="login-hero">
          <div className="brand-mark"><Icon name="compare" size={22} /></div>
          <h1>Competencias,<br /><span className="grad">a la vista.</span></h1>
          <p>Cada clase, cada equipo y cada estudiante en un solo lugar. Compara, encuentra a quien necesita apoyo y decide con datos.</p>
          <ul className="hero-points">
            <li><Icon name="check" size={16} />Cada persona ve solo lo que le corresponde</li>
            <li><Icon name="check" size={16} />Gráficos araña para comparar en segundos</li>
            <li><Icon name="check" size={16} />Del Excel del juego a conclusiones claras</li>
          </ul>
        </section>

        <section className="login-card-wrap">
          <form key={shake} className={"login-card" + (shake ? " shake" : "")} onSubmit={(e) => { e.preventDefault(); go(); }}>
            <h2>Iniciar sesión</h2>
            <p className="muted">{api.mode === "demo" ? "Modo demostración: datos de ejemplo en tu navegador." : "Usa la cuenta que te entregó tu institución."}</p>
            <label className="field">
              <span>Usuario</span>
              <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="usuario" autoFocus />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
            </label>
            {err && <div className="form-err" role="alert">{err}</div>}
            <button className="btn primary lg" disabled={busy}>{busy ? <span className="spinner" /> : "Continuar"}</button>

            {api.mode === "demo" && (
              <div className="demo-pick">
                <div className="divider"><span>o explora como</span></div>
                {DEMO_ACCOUNTS.map((a) => (
                  <button key={a.usuario} type="button" className="demo-acc" disabled={busy} onClick={() => { setUsuario(a.usuario); go(a.usuario, "demo"); }}>
                    <Avatar name={a.nombre} size={34} />
                    <span><b>{a.nombre}</b><small>{rolLabel(a.rol)} · {a.nota}</small></span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
                <p className="tiny muted">Todas las cuentas demo usan la contraseña <code>demo</code>. Otros: <code>carlos.pena</code>, <code>sofia.rojas</code>…</p>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
