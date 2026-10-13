import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../data/store";
import { Avatar, Icon } from "./ui";
import type { Rol } from "../lib/types";
import { rolLabel } from "../lib/labels";
import { displayName, normText } from "../lib/metrics";
import StudentSheet from "./StudentSheet";
import { ThemeButton } from "./Theme";

export const NAV: { to: string; label: string; icon: string; roles: Rol[] }[] = [
  { to: "/", label: "Inicio", icon: "home", roles: ["admin", "decano", "maestro"] },
  { to: "/clases", label: "Clases", icon: "classes", roles: ["admin", "decano", "maestro"] },
  { to: "/comparar", label: "Comparar", icon: "compare", roles: ["admin", "decano", "maestro"] },
  { to: "/estudiantes", label: "Estudiantes", icon: "students", roles: ["admin", "decano", "maestro"] },
  { to: "/equipo", label: "Equipo", icon: "team", roles: ["admin", "decano"] },
  { to: "/importar", label: "Importar", icon: "upload", roles: ["admin"] },
  { to: "/ajustes", label: "Ajustes", icon: "settings", roles: ["admin", "decano", "maestro"] },
];

interface Shell { openStudent(id: string, list?: string[]): void; openPalette(): void; }
const ShellCtx = createContext<Shell>({ openStudent: () => {}, openPalette: () => {} });
export const useShell = () => useContext(ShellCtx);

export default function Layout({ children }: { children: ReactNode }) {
  const { user, api, setUser, loading } = useApp();
  const [student, setStudent] = useState<{ id: string; list: string[] } | null>(null);
  const [palette, setPalette] = useState(false);
  const loc = useLocation();
  const nav = NAV.filter((n) => user && n.roles.includes(user.rol));

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea,select")) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);

  const shell = useMemo<Shell>(() => ({
    openStudent: (id, list) => setStudent({ id, list: list ?? [id] }),
    openPalette: () => setPalette(true),
  }), []);
  if (!user) return null;
  const mobileNav = nav.filter((n) => ["/", "/clases", "/comparar", "/estudiantes", user.rol === "maestro" ? "/ajustes" : "/equipo"].includes(n.to));

  return (
    <ShellCtx.Provider value={shell}>
      <div className="shell">
        <aside className="sidebar">
          <div className="sb-brand">
            <div className="brand-mark sm"><Icon name="compare" size={16} /></div>
            <span>Competencias</span>
            {api.mode === "demo" && <span className="pill demo">Demo</span>}
          </div>
          <button className="sb-search" type="button" onClick={() => setPalette(true)}>
            <Icon name="search" size={16} /><span>Buscar</span><kbd>⌘K</kbd>
          </button>
          <nav className="sb-nav">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
                <Icon name={n.icon} size={19} /><span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sb-foot">
            <div className="sb-user">
              <Avatar name={user.nombre} size={34} />
              <div><b>{user.nombre}</b><small>{rolLabel(user.rol)}</small></div>
            </div>
            <div className="sb-actions">
              <ThemeButton />
              <button className="icon-btn" type="button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={async () => { await api.signOut(); setUser(null); }}>
                <Icon name="logout" />
              </button>
            </div>
          </div>
        </aside>

        <header className="mobile-top">
          <div className="sb-brand"><div className="brand-mark sm"><Icon name="compare" size={16} /></div><span>Competencias</span></div>
          <div className="row-gap">
            <button className="icon-btn" type="button" onClick={() => setPalette(true)} aria-label="Buscar"><Icon name="search" /></button>
            <ThemeButton />
          </div>
        </header>

        <main className="main">
          {loading && <div className="topline" />}
          <div className="page" key={loc.pathname}>{children}</div>
        </main>

        <nav className="tabbar">
          {mobileNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => "tb-link" + (isActive ? " active" : "")}>
              <Icon name={n.icon} size={22} /><span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {student && <StudentSheet id={student.id} list={student.list} onNav={(id) => setStudent({ ...student, id })} onClose={() => setStudent(null)} />}
      {palette && <Palette onClose={() => setPalette(false)} onStudent={(id) => { setPalette(false); setStudent({ id, list: [id] }); }} nav={nav} />}
    </ShellCtx.Provider>
  );
}

/* ---------- Paleta de comandos (⌘K / Ctrl+K / "/") ---------- */
function Palette({ onClose, onStudent, nav }: { onClose(): void; onStudent(id: string): void; nav: typeof NAV }) {
  const { snap, rows, user } = useApp();
  const go = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  type Item = { key: string; icon: string; title: string; sub?: string; color?: string; act(): void };
  const items = useMemo<Item[]>(() => {
    const n = normText(q);
    const match = (s: string) => !n || normText(s).includes(n);
    const out: Item[] = [];
    nav.filter((x) => match(x.label)).forEach((x) => out.push({ key: "p" + x.to, icon: x.icon, title: x.label, sub: "Ir a la sección", act: () => go(x.to) }));
    snap.clases.filter((c) => match(c.nombre + " " + c.grupo)).slice(0, 6).forEach((c) =>
      out.push({ key: "c" + c.id, icon: "classes", title: c.nombre, sub: `Clase · grupo ${c.grupo || "—"}`, color: c.color, act: () => go("/clases/" + c.id) }));
    if (user?.rol !== "maestro") snap.profiles.filter((p) => p.id !== user?.id && match(p.nombre + " " + p.usuario)).slice(0, 5).forEach((p) =>
      out.push({ key: "u" + p.id, icon: "team", title: p.nombre, sub: rolLabel(p.rol) + " · @" + p.usuario, act: () => go("/equipo?u=" + p.id) }));
    if (n.length >= 2) rows.filter((r) => r.q.includes(n)).slice(0, 8).forEach((r) =>
      out.push({ key: "s" + r.r.id, icon: "students", title: displayName(r.r.nombre), sub: `${r.cls.nombre} · ${r.carrera}`, act: () => onStudent(r.r.id) }));
    return out;
  }, [q, snap, rows, nav, go, onStudent, user]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const pick = useCallback((it?: Item) => { if (!it) return; it.act(); onClose(); }, [onClose]);

  return (
    <div className="modal-backdrop top" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-label="Buscar">
        <div className="pal-input">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar estudiantes, clases, personas o secciones…"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") pick(items[sel]);
              else if (e.key === "Escape") onClose();
            }} />
          <kbd>esc</kbd>
        </div>
        <div className="pal-list" ref={listRef}>
          {items.length === 0 && <div className="pal-empty">Sin resultados para “{q}”.</div>}
          {items.map((it, i) => (
            <button key={it.key} type="button" className={"pal-item" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onClick={() => pick(it)}>
              <span className="pal-ico" style={it.color ? { background: it.color, color: "#fff" } : undefined}><Icon name={it.icon} size={16} /></span>
              <span className="pal-txt"><b>{it.title}</b>{it.sub && <small>{it.sub}</small>}</span>
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
