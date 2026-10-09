import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { initials } from "../lib/metrics";

/* ---------- Iconos (trazo fino, estilo SF Symbols) ---------- */
const P: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>,
  classes: <><rect x="3" y="4" width="7" height="7" rx="2" /><rect x="14" y="4" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  compare: <><path d="M12 3 20.5 9.2 17.3 19.2H6.7L3.5 9.2Z" /><path d="M12 7.5 16 10.4 14.5 15H9.5L8 10.4Z" /></>,
  students: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.9" /></>,
  team: <><circle cx="12" cy="6.5" r="3" /><circle cx="5" cy="16" r="2.5" /><circle cx="19" cy="16" r="2.5" /><path d="M12 9.5V13M12 13 6.5 14.3M12 13l5.5 1.3" /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  cloud: <path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9Z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16Z" /><path d="m14 6 4 4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
};
export function Icon({ name, size = 20, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg className={"ico " + (className ?? "")} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>
  );
}

const AV_COLORS = ["#0a84ff", "#ff9f0a", "#30d158", "#ff375f", "#bf5af2", "#64d2ff", "#5e5ce6", "#ac8e68"];
export function Avatar({ name, size = 32, color }: { name: string; size?: number; color?: string }) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const bg = color ?? AV_COLORS[Math.abs(h) % AV_COLORS.length];
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}>{initials(name.replace(/^(Dra?|Mtro|Mtra|Lic|Ing)\.\s*/i, ""))}</span>;
}

export function Segmented<T extends string>({ value, options, onChange, size }: {
  value: T; options: { value: NoInfer<T>; label: ReactNode }[]; onChange(v: NoInfer<T>): void; size?: "sm";
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={"seg" + (size ? " sm" : "")} role="tablist" style={{ ["--n" as string]: options.length, ["--i" as string]: idx }}>
      <span className="seg-thumb" />
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label, allLabel }: {
  value: string; onChange(v: string): void; options: { value: string; label: string }[]; label?: string; allLabel?: string;
}) {
  return (
    <label className="select">
      {label && <span>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel && <option value="all">{allLabel}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Sheet({ open, onClose, children, title, wide }: { open: boolean; onClose(): void; children: ReactNode; title?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    document.body.classList.add("noscroll");
    return () => { window.removeEventListener("keydown", k); document.body.classList.remove("noscroll"); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={"sheet" + (wide ? " wide" : "")} role="dialog" aria-modal="true">
        <header className="sheet-h">
          <div className="sheet-title">{title}</div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>, document.body);
}

export function Modal({ open, onClose, children, title }: { open: boolean; onClose(): void; children: ReactNode; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    setTimeout(() => ref.current?.querySelector<HTMLInputElement>("input,select,button")?.focus(), 30);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" ref={ref}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>, document.body);
}

export function Empty({ icon = "spark", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, children }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad"; children?: ReactNode }) {
  return (
    <div className="stat card">
      <div className="stat-l">{label}</div>
      <div className={"stat-v" + (tone ? " " + tone : "")}>{value}</div>
      {sub && <div className="stat-s">{sub}</div>}
      {children}
    </div>
  );
}

export function Delta({ v, invert }: { v: number | null; invert?: boolean }) {
  if (v === null || isNaN(v) || Math.abs(v) < 0.05) return <span className="delta">±0</span>;
  const good = invert ? v < 0 : v > 0;
  return <span className={"delta " + (good ? "up" : "down")}>{v > 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1)}</span>;
}

export function LevelChip({ v }: { v: number | null }) {
  if (v === null) return <span className="chip">—</span>;
  const id = v >= 66 ? "alto" : v < 34 ? "bajo" : "medio";
  return <span className={"chip " + id}>{id[0].toUpperCase() + id.slice(1)}</span>;
}
