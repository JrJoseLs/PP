import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../data/store";
import { Avatar, Empty, Icon, Modal, Segmented } from "../components/ui";
import { LevelBar } from "../components/Charts";
import { avgIndex, fmt, plural } from "../lib/metrics";
import type { Profile, Rol } from "../lib/types";
import { D, M, low, rolLabel } from "../lib/labels";
import { PageHead } from "./Dashboard";
import { downloadAccountsTemplate, downloadCredentials, parseAccounts, type AccountRow } from "../lib/templates";

export default function Equipo() {
  const { user, snap } = useApp();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"org" | "clases">(params.get("tab") === "clases" ? "clases" : "org");
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [newFor, setNewFor] = useState<string | null>(null);
  const [bulk, setBulk] = useState(params.get("importar") === "1");
  const rol = user!.rol;

  useEffect(() => {
    const u = params.get("u");
    if (u) { const p = snap.profiles.find((x) => x.id === u); if (p) setEditing(p); setParams({}, { replace: true }); }
  }, [params, snap.profiles, setParams]);

  return (
    <>
      <PageHead title="Equipo"
        sub={rol === "admin" ? `Crea cuentas, organiza a cada ${low(M().one)} bajo su ${low(D().one)} y decide quién ve cada clase.` : `Tus ${low(M().many)} y las clases que les asignas. Cada uno ve solo sus clases.`}
        actions={<>
          <button className="btn" onClick={() => setBulk(true)}><Icon name="upload" size={16} /> Importar cuentas</button>
          <button className="btn primary" onClick={() => { setNewFor(null); setEditing("new"); }}><Icon name="plus" size={16} /> {rol === "admin" ? "Nueva cuenta" : `Nuevo ${low(M().one)}`}</button>
        </>} />
      <div className="toolbar">
        <Segmented value={tab} onChange={setTab} options={[{ value: "org", label: rol === "admin" ? "Organización" : `Mis ${low(M().many)}` }, { value: "clases", label: "Acceso a clases" }]} />
      </div>
      {tab === "org" ? (rol === "admin" ? <OrgAdmin onEdit={setEditing} onNew={(d) => { setNewFor(d); setEditing("new"); }} /> : <OrgDecano onEdit={setEditing} />)
        : <Matrix />}
      {editing && <UserModal p={editing === "new" ? null : editing} decanoFor={newFor} onClose={() => setEditing(null)} />}
      {bulk && <BulkAccounts onClose={() => setBulk(false)} />}
    </>
  );
}

/* ---------- Organigrama (admin): columnas por decano, arrastra maestros entre ellas ---------- */
function OrgAdmin({ onEdit, onNew }: { onEdit(p: Profile): void; onNew(decanoId: string | null): void }) {
  const { snap, rowsByClase, run } = useApp();
  const [over, setOver] = useState<string | null>(null);
  const decanos = snap.profiles.filter((p) => p.rol === "decano");
  const admins = snap.profiles.filter((p) => p.rol === "admin");
  const cols = [...decanos.map((d) => ({ id: d.id, d })), { id: "none", d: null as Profile | null }];
  const rowsOf = (cls: string[]) => cls.flatMap((c) => rowsByClase.get(c) ?? []);

  const drop = (target: string) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/maestro");
    const m = snap.profiles.find((p) => p.id === id);
    const dec = target === "none" ? null : target;
    if (m && m.decano_id !== dec) run((a) => a.updateProfile(id, { decano_id: dec }), `${m.nombre} → ${dec ? snap.profiles.find((p) => p.id === dec)?.nombre : "sin " + low(D().one)}`);
  };

  return (
    <>
      <div className="admins-row">
        <span className="muted small">Administración</span>
        {admins.map((a) => <button key={a.id} className="pchip" onClick={() => onEdit(a)}><Avatar name={a.nombre} size={22} /><span>{a.nombre}</span></button>)}
      </div>
      <p className="muted small hint"><Icon name="spark" size={14} /> Arrastra a un {low(M().one)} a otra columna para cambiarlo de {low(D().one)}.</p>
      <div className="org">
        {cols.map(({ id, d }) => {
          const ms = snap.profiles.filter((p) => p.rol === "maestro" && (d ? p.decano_id === d.id : !p.decano_id));
          const clsIds = d ? snap.clases.filter((c) => c.decanos.includes(d.id)).map((c) => c.id) : [];
          const rr = rowsOf(clsIds);
          if (!d && !ms.length) return null;
          return (
            <section key={id} className={"org-col card" + (over === id ? " over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(id); }} onDragLeave={() => setOver(null)} onDrop={drop(id)}>
              {d ? (
                <button className="org-head" onClick={() => onEdit(d)}>
                  <Avatar name={d.nombre} size={40} />
                  <span className="rank-txt"><b>{d.nombre}</b><small>{plural(clsIds.length, "clase", "clases")} · {plural(ms.length, low(M().one), low(M().many))}{!d.activo ? " · inactivo" : ""}</small></span>
                  <span className="org-idx">{fmt(avgIndex(rr))}</span>
                </button>
              ) : <div className="org-head plain"><span className="rank-txt"><b>Sin {low(D().one)}</b><small>{M().many} sin asignar</small></span></div>}
              {d && <LevelBar rows={rr} />}
              <div className="org-list">
                {ms.map((m) => <MaestroCard key={m.id} m={m} onEdit={() => onEdit(m)} draggable />)}
                {!ms.length && <p className="muted small">Suelta aquí a un {low(M().one)}.</p>}
              </div>
              {d && <button className="btn ghost sm full" onClick={() => onNew(d.id)}><Icon name="plus" size={14} /> {M().one}</button>}
            </section>
          );
        })}
        {!decanos.length && <Empty icon="team" title={`Aún no hay ${low(D().many)}`}>Crea una cuenta con rol {D().one} para empezar a repartir las clases.</Empty>}
      </div>
    </>
  );
}

function MaestroCard({ m, onEdit, draggable }: { m: Profile; onEdit(): void; draggable?: boolean }) {
  const { snap, rowsByClase } = useApp();
  const cls = snap.clases.filter((c) => c.maestros.includes(m.id));
  const rr = cls.flatMap((c) => rowsByClase.get(c.id) ?? []);
  return (
    <div className={"mcard" + (m.activo ? "" : " off")} draggable={draggable} onDragStart={(e) => e.dataTransfer.setData("text/maestro", m.id)} onClick={onEdit} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onEdit(); }}>
      <Avatar name={m.nombre} size={30} />
      <div className="rank-txt">
        <b>{m.nombre}{!m.activo && <span className="pill">inactivo</span>}</b>
        <small>{cls.length ? cls.map((c) => c.nombre).join(" · ") : "Sin clases asignadas"}</small>
      </div>
      {rr.length > 0 && <span className="org-idx sm">{fmt(avgIndex(rr))}</span>}
    </div>
  );
}

function OrgDecano({ onEdit }: { onEdit(p: Profile): void }) {
  const { snap, user, rowsByClase } = useApp();
  const ms = snap.profiles.filter((p) => p.rol === "maestro" && p.decano_id === user!.id);
  if (!ms.length) return <Empty icon="team" title={`Aún no tienes ${low(M().many)}`}>Crea sus cuentas con “Nuevo {low(M().one)}”. Luego, en “Acceso a clases”, decide qué clase ve cada uno.</Empty>;
  return (
    <div className="mgrid">
      {ms.map((m) => {
        const cls = snap.clases.filter((c) => c.maestros.includes(m.id));
        const rr = cls.flatMap((c) => rowsByClase.get(c.id) ?? []);
        return (
          <button key={m.id} className={"card mbig" + (m.activo ? "" : " off")} onClick={() => onEdit(m)}>
            <div className="row-gap"><Avatar name={m.nombre} size={44} /><span className="rank-txt"><b>{m.nombre}</b><small>@{m.usuario}{!m.activo ? " · inactivo" : ""}</small></span><span className="org-idx">{fmt(avgIndex(rr))}</span></div>
            <LevelBar rows={rr} />
            <div className="chips">{cls.length ? cls.map((c) => <span key={c.id} className="pill"><span className="dot" style={{ background: c.color }} />{c.nombre}</span>) : <span className="pill warn">Sin clases</span>}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Matriz de acceso: clases × personas ---------- */
function Matrix() {
  const { snap, user, run, person } = useApp();
  const go = useNavigate();
  const rol = user!.rol;
  const [who, setWho] = useState<"decanos" | "maestros">(rol === "admin" ? "decanos" : "maestros");
  const people = useMemo(() => (who === "decanos"
    ? snap.profiles.filter((p) => p.rol === "decano")
    : snap.profiles.filter((p) => p.rol === "maestro" && (rol === "admin" || p.decano_id === user!.id))
  ).filter((p) => p.activo).sort((a, b) => (a.decano_id ?? "").localeCompare(b.decano_id ?? "") || a.nombre.localeCompare(b.nombre, "es")), [snap.profiles, who, rol, user]);
  const [busy, setBusy] = useState<string | null>(null);

  if (!snap.clases.length) return <Empty icon="classes" title="No hay clases" />;
  const toggle = async (claseId: string, pid: string) => {
    const c = snap.clases.find((x) => x.id === claseId)!;
    const list = who === "decanos" ? c.decanos : c.maestros;
    const next = list.includes(pid) ? list.filter((x) => x !== pid) : [...list, pid];
    setBusy(claseId + pid);
    await run((a) => (who === "decanos" ? a.setClaseDecanos(claseId, next) : a.setClaseMaestros(claseId, next)));
    setBusy(null);
  };

  return (
    <>
      {rol === "admin" && <div className="toolbar"><Segmented size="sm" value={who} onChange={setWho} options={[{ value: "decanos", label: `Clases → ${D().many}` }, { value: "maestros", label: `Clases → ${M().many}` }]} /></div>}
      <p className="muted small hint">
        {who === "decanos" ? `Cada ${low(D().one)} verá solo las clases marcadas en su columna, y podrá entregarlas a sus ${low(M().many)}.`
          : rol === "decano" ? `Marca qué clase ve cada uno de tus ${low(M().many)}. No ven nada más.` : `Normalmente lo hace cada ${low(D().one)}, pero como administración también puedes hacerlo.`}
      </p>
      {!people.length ? <Empty icon="team" title={`No hay ${low((who === "decanos" ? D() : M()).many)}`} /> : (
        <div className="card table-card">
          <div className="table-scroll">
            <table className="matrix">
              <thead><tr><th className="sticky">Clase</th>
                {people.map((p) => <th key={p.id} title={p.nombre + (rol === "admin" && p.decano_id ? " · " + (person(p.decano_id)?.nombre ?? "") : "")}>
                  <div className="mx-h"><Avatar name={p.nombre} size={28} /><span>{p.nombre.replace(/^(Dra?|Mtro)\.\s*/, "").split(" ")[0]}</span></div></th>)}
              </tr></thead>
              <tbody>
                {snap.clases.map((c) => {
                  const list = who === "decanos" ? c.decanos : c.maestros;
                  return (
                    <tr key={c.id}>
                      <td className="sticky"><button className="link" onClick={() => go("/clases/" + c.id)}><span className="dot" style={{ background: c.color }} /> {c.nombre}</button>
                        {!list.length && <span className="pill warn">nadie</span>}</td>
                      {people.map((p) => {
                        const on = list.includes(p.id);
                        return <td key={p.id} className="mx-c"><button className={"mx-dot" + (on ? " on" : "") + (busy === c.id + p.id ? " busy" : "")} aria-pressed={on}
                          aria-label={`${on ? "Quitar" : "Dar"} acceso a ${p.nombre} en ${c.nombre}`} onClick={() => toggle(c.id, p.id)}>{on && <Icon name="check" size={14} />}</button></td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Crear / editar cuenta ---------- */
function genPass() {
  const a = "abcdefghjkmnpqrstuvwxyz", A = "ABCDEFGHJKLMNPQRSTUVWXYZ", d = "23456789";
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return Array.from({ length: 4 }, () => pick(A) + pick(a)).join("") + pick(d) + pick(d);
}
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^(dra?|mtro|mtra|lic|ing)\.?\s+/, "").trim().split(/\s+/).slice(0, 2).join(".").replace(/[^a-z0-9.]/g, "");

function UserModal({ p, decanoFor, onClose }: { p: Profile | null; decanoFor: string | null; onClose(): void }) {
  const { user, snap, run, api } = useApp();
  const isAdmin = user!.rol === "admin";
  const [f, setF] = useState({ nombre: p?.nombre ?? "", usuario: p?.usuario ?? "", password: p ? "" : genPass(),
    rol: (p?.rol ?? "maestro") as Rol, decano_id: p ? p.decano_id : isAdmin ? decanoFor : user!.id, activo: p?.activo ?? true });
  const [touchedUser, setTouchedUser] = useState(!!p);
  const [created, setCreated] = useState<{ usuario: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const decanos = snap.profiles.filter((x) => x.rol === "decano");
  const self = p?.id === user!.id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    if (!p) {
      const res = await run((a) => a.createUser({ nombre: f.nombre, usuario: f.usuario, password: f.password, rol: f.rol, decano_id: f.rol === "maestro" ? f.decano_id : null }), "Cuenta creada");
      if (res) setCreated({ usuario: f.usuario, password: f.password });
    } else {
      const patch: Partial<Profile> = { nombre: f.nombre, activo: f.activo };
      if (isAdmin) { patch.rol = f.rol; patch.decano_id = f.rol === "maestro" ? f.decano_id : null; }
      const ok = await run((a) => a.updateProfile(p.id, patch), "Cambios guardados");
      if (ok !== false && f.password) await run((a) => a.setPassword(p.id, f.password), "Contraseña actualizada");
      onClose();
    }
    setBusy(false);
  };

  if (created) return (
    <Modal open title="Cuenta lista" onClose={onClose}>
      <p>Entrega estos datos a <b>{f.nombre || created.usuario}</b>. Por seguridad la contraseña no se vuelve a mostrar.</p>
      <div className="cred"><div><small>Usuario</small><code>{created.usuario}</code></div><div><small>Contraseña</small><code>{created.password}</code></div></div>
      {api.mode === "cloud" && <p className="muted small">Puede cambiarla luego en Ajustes.</p>}
      <div className="modal-actions"><button className="btn" onClick={() => navigator.clipboard?.writeText(`Usuario: ${created.usuario}\nContraseña: ${created.password}\n${location.origin + location.pathname}`)}>Copiar</button>
        <span className="grow" /><button className="btn primary" onClick={onClose}>Listo</button></div>
    </Modal>
  );

  return (
    <Modal open title={p ? "Editar cuenta" : isAdmin ? "Nueva cuenta" : `Nuevo ${low(M().one)}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nombre completo</span><input value={f.nombre} required placeholder="Ej. Laura Silva"
          onChange={(e) => setF({ ...f, nombre: e.target.value, usuario: touchedUser ? f.usuario : slug(e.target.value) })} /></label>
        <label className="field"><span>Usuario</span><input value={f.usuario} disabled={!!p} required pattern="[a-z0-9._\-]{3,}" placeholder="laura.silva"
          onChange={(e) => { setTouchedUser(true); setF({ ...f, usuario: e.target.value.toLowerCase() }); }} /></label>
        <label className="field"><span>{p ? "Nueva contraseña (opcional)" : "Contraseña"}</span>
          <span className="input-row"><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={p && !f.password ? 0 : 8} required={!p} placeholder={p ? "Dejar vacío para no cambiarla" : ""} />
            <button type="button" className="btn sm" onClick={() => setF({ ...f, password: genPass() })} title="Generar"><Icon name="key" size={14} /></button></span></label>
        {isAdmin && !self && (
          <div className="field"><span>Rol</span>
            <Segmented value={f.rol} onChange={(v) => setF({ ...f, rol: v })} options={(["admin", "decano", "maestro"] as Rol[]).map((r) => ({ value: r, label: rolLabel(r) }))} /></div>
        )}
        {isAdmin && f.rol === "maestro" && (
          <label className="field"><span>{D().one} a cargo</span>
            <select value={f.decano_id ?? ""} onChange={(e) => setF({ ...f, decano_id: e.target.value || null })}>
              <option value="">Sin {low(D().one)}</option>{decanos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select></label>
        )}
        {p && !self && <label className="switch-label"><input type="checkbox" className="switch" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Cuenta activa</label>}
        <div className="modal-actions">
          {p && !self && <button type="button" className="btn danger ghost" onClick={async () => {
            if (!confirm(`¿Eliminar la cuenta de ${p.nombre}? Perderá el acceso inmediatamente.`)) return;
            await run((a) => a.deleteUser(p.id), "Cuenta eliminada"); onClose();
          }}><Icon name="trash" size={16} /></button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : p ? "Guardar" : "Crear cuenta"}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Crear cuentas en bloque desde Excel ---------- */
function BulkAccounts({ onClose }: { onClose(): void }) {
  const { user, snap, api, refresh, toast } = useApp();
  const isAdmin = user!.rol === "admin";
  const decanos = snap.profiles.filter((p) => p.rol === "decano");
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [done, setDone] = useState<AccountRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (f: File) => {
    try {
      const list = await parseAccounts(f, isAdmin);
      const fileDec = new Set(list.filter((r) => r.rol === "decano").map((r) => r.usuario));
      list.forEach((r) => {
        if (r.error) return;
        if (snap.profiles.some((p) => p.usuario === r.usuario)) { r.error = "Ya existe"; return; }
        if (r.rol !== "maestro") { r.decano_id = null; return; }
        if (!isAdmin) { r.decano_id = user!.id; return; }
        if (!r.decano) { r.decano_id = null; return; }
        const d = decanos.find((x) => x.usuario === r.decano || x.nombre.toLowerCase() === r.decano);
        if (d) r.decano_id = d.id; else if (!fileDec.has(r.decano)) r.error = `${D().one} «${r.decano}» no encontrado`;
      });
      setRows(list);
      if (!list.length) toast("El archivo no tiene filas para crear (las de EJEMPLO se ignoran).", "error");
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const create = async () => {
    if (!rows) return;
    setBusy(true);
    const ok: AccountRow[] = [];
    const created = new Map<string, string>();   // usuario de decano → id
    // primero administración y decanos, para que los maestros encuentren a su decano
    const order = [...rows.filter((r) => !r.error)].sort((a, b) => (a.rol === "maestro" ? 1 : 0) - (b.rol === "maestro" ? 1 : 0));
    for (const r of order) {
      try {
        const decano_id = r.rol === "maestro" ? (r.decano_id ?? (r.decano ? created.get(r.decano) ?? null : null)) : null;
        const p = await api.createUser({ nombre: r.nombre, usuario: r.usuario, password: r.password, rol: r.rol, decano_id });
        if (p.rol === "decano") created.set(p.usuario, p.id);
        ok.push(r);
      } catch (e) { r.error = (e as Error).message; }
    }
    await refresh();
    setBusy(false); setDone(ok); setRows([...rows]);
    toast(`${plural(ok.length, "cuenta creada", "cuentas creadas")}`);
  };

  const valid = rows?.filter((r) => !r.error).length ?? 0;
  return (
    <Modal open title={isAdmin ? "Importar cuentas" : `Importar ${low(M().many)}`} onClose={onClose}>
      {!rows && <>
        <p className="muted">Descarga la plantilla, escribe una fila por persona y súbela. {isAdmin ? `Puedes crear ${low(D().many)} y sus ${low(M().many)} en el mismo archivo.` : `Todos quedarán como tus ${low(M().many)}.`}</p>
        <div className="bulk-actions">
          <button className="btn" onClick={() => downloadAccountsTemplate(isAdmin, decanos)}><Icon name="download" size={16} /> Descargar plantilla</button>
          <label className="btn primary"><Icon name="upload" size={16} /> Subir Excel
            <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} /></label>
        </div>
      </>}
      {rows && (
        <>
          <div className="bulk-list">
            {rows.map((r) => (
              <div key={r.fila} className={"bulk-row" + (r.error ? " bad" : done?.includes(r) ? " ok" : "")}>
                <Avatar name={r.nombre} size={28} />
                <span className="rank-txt"><b>{r.nombre}</b><small>@{r.usuario} · {rolLabel(r.rol)}{r.rol === "maestro" && isAdmin && r.decano ? " · " + r.decano : ""}</small></span>
                <span className="small">{r.error ? <span className="neg">{r.error}</span> : done?.includes(r) ? <span className="pos">Creada</span> : <span className="muted">Lista</span>}</span>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            {done ? <>
              <button className="btn" onClick={() => downloadCredentials(done)} disabled={!done.length}><Icon name="download" size={16} /> Credenciales (Excel)</button>
              <span className="grow" /><button className="btn primary" onClick={onClose}>Listo</button>
            </> : <>
              <button className="btn" onClick={() => setRows(null)}>Otro archivo</button>
              <span className="grow" />
              <button className="btn primary" disabled={!valid || busy} onClick={create}>{busy ? <span className="spinner" /> : `Crear ${plural(valid, "cuenta", "cuentas")}`}</button>
            </>}
          </div>
          {done && done.length > 0 && <p className="muted tiny">Descarga las credenciales ahora: las contraseñas no se vuelven a mostrar.</p>}
        </>
      )}
    </Modal>
  );
}
