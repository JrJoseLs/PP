/* Barra de filtros del ámbito: buscador con sugerencias + filtros encadenados con conteos.
   Escribir "biki" sugiere "Equipo: BIKING (8)"; elegirlo lo convierte en una píldora.
   Cada menú (Clase, Carrera, Grupo, Equipo, Nivel) muestra solo lo que existe con los demás filtros. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "../data/store";
import { Icon } from "./ui";
import { displayName, normText, plural } from "../lib/metrics";
import { EMPTY_SCOPE, FACETS, FACET_LABEL, facetLabel, facetOptions, scopeActive, useScoped, type Facet, type Option } from "../lib/scope";
import { useShell } from "./Layout";

export default function FilterBar({ facets = FACETS, summary, right }: { facets?: Facet[]; summary?: ReactNode; right?: ReactNode }) {
  const { snap } = useApp();
  const { scope, setScope, rows, allRows } = useScoped();
  const { openStudent } = useShell();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [menu, setMenu] = useState<Facet | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const shown = facets.filter((f) => f !== "equipo" || allRows.some((r) => r.equipo));

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setMenu(null); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggle = (f: Facet, v: string) => {
    const has = scope[f].includes(v);
    setScope({ ...scope, [f]: has ? scope[f].filter((x) => x !== v) : [...scope[f], v] });
  };

  /* sugerencias del buscador: valores de filtros que coinciden + estudiantes */
  type Sug = { key: string; kind: Facet | "est" | "texto"; label: string; sub: string; act(): void };
  const sugs = useMemo<Sug[]>(() => {
    const n = normText(text);
    if (!n) return [];
    const out: Sug[] = [];
    shown.forEach((f) => facetOptions(allRows, scope, f, snap.clases)
      .filter((o) => o.count > 0 && !scope[f].includes(o.value) && normText(o.label).includes(n)).slice(0, 4)
      .forEach((o) => out.push({ key: f + o.value, kind: f, label: o.label, sub: `${FACET_LABEL[f]} · ${plural(o.count, "estudiante", "estudiantes")}`,
        act: () => { toggle(f, o.value); setText(""); } })));
    rows.filter((r) => r.q.includes(n)).slice(0, 5).forEach((r) => out.push({ key: "e" + r.r.id, kind: "est", label: displayName(r.r.nombre),
      sub: `Estudiante · ${r.cls.nombre}`, act: () => { openStudent(r.r.id); setText(""); setOpen(false); } }));
    out.push({ key: "texto", kind: "texto", label: `Buscar «${text}» en todo`, sub: "Nombre, matrícula, grupo, equipo o clase",
      act: () => { setScope({ ...scope, q: text.trim() }); setText(""); setOpen(false); } });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, scope, allRows, rows, snap.clases]);
  useEffect(() => setSel(0), [text]);

  const chips = FACETS.flatMap((f) => scope[f].map((v) => ({ f, v, label: facetLabel(f, v, snap.clases) })));
  const active = scopeActive(scope);

  return (
    <div className="fbar" ref={box}>
      <div className={"fbar-main" + (open && sugs.length ? " open" : "")}>
        <Icon name="search" size={16} />
        <div className="fbar-chips">
          {chips.map((c) => (
            <span key={c.f + c.v} className={"fchip f-" + c.f}><small>{FACET_LABEL[c.f]}</small>{c.label}
              <button onClick={() => toggle(c.f, c.v)} aria-label={"Quitar " + c.label}><Icon name="close" size={11} /></button></span>
          ))}
          {scope.q && <span className="fchip f-q"><small>Texto</small>«{scope.q}»<button onClick={() => setScope({ ...scope, q: "" })} aria-label="Quitar texto"><Icon name="close" size={11} /></button></span>}
          <input value={text} placeholder={active ? "Añadir filtro…" : "Busca una clase, carrera, equipo, grupo o estudiante…"}
            onChange={(e) => { setText(e.target.value); setOpen(true); setMenu(null); }} onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(sugs.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter" && sugs[sel]) { e.preventDefault(); sugs[sel].act(); }
              else if (e.key === "Escape") { setOpen(false); setText(""); }
              else if (e.key === "Backspace" && !text && chips.length) { const c = chips[chips.length - 1]; toggle(c.f, c.v); }
            }} />
        </div>
        {active && <button className="link small" onClick={() => setScope(EMPTY_SCOPE)}>Limpiar</button>}
        {open && sugs.length > 0 && (
          <div className="fbar-sug">
            {sugs.map((s, i) => (
              <button key={s.key} className={"sug" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onMouseDown={(e) => e.preventDefault()} onClick={s.act}>
                <span className={"sug-ico f-" + s.kind}><Icon name={s.kind === "est" ? "students" : s.kind === "texto" ? "search" : s.kind === "clase" ? "classes" : s.kind === "equipo" ? "team" : "spark"} size={14} /></span>
                <span className="rank-txt"><b>{s.label}</b><small>{s.sub}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="fbar-row">
        {shown.map((f) => (
          <FacetMenu key={f} f={f} open={menu === f} onOpen={() => { setMenu(menu === f ? null : f); setOpen(false); }}
            options={facetOptions(allRows, scope, f, snap.clases)} selected={scope[f]} onToggle={(v) => toggle(f, v)}
            onOnly={(v) => setScope({ ...scope, [f]: [v] })} onClear={() => setScope({ ...scope, [f]: [] })} />
        ))}
        {summary && <span className="fbar-sum">{summary}</span>}
        {right && <span className="fbar-right">{right}</span>}
      </div>
    </div>
  );
}

function FacetMenu({ f, open, onOpen, options, selected, onToggle, onOnly, onClear }: {
  f: Facet; open: boolean; onOpen(): void; options: Option[]; selected: string[]; onToggle(v: string): void; onOnly(v: string): void; onClear(): void;
}) {
  const [q, setQ] = useState("");
  const n = normText(q);
  const list = options.filter((o) => !n || normText(o.label).includes(n));
  const avail = options.filter((o) => o.count > 0).length;
  return (
    <div className="fmenu">
      <button className={"fbtn" + (selected.length ? " on" : "") + (open ? " open" : "")} onClick={onOpen} disabled={!avail && !selected.length}>
        {FACET_LABEL[f]}{selected.length ? <b>{selected.length}</b> : <small>{avail}</small>}<Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="fpop">
          {options.length > 8 && <input autoFocus className="fpop-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${FACET_LABEL[f].toLowerCase()}…`} />}
          <div className="fpop-list">
            {list.map((o) => (
              <label key={o.value} className={"fopt" + (o.count === 0 ? " zero" : "")}>
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
                <span className="fopt-l">{o.label}</span>
                <span className="fopt-n">{o.count}</span>
                <button className="fopt-only" onClick={(e) => { e.preventDefault(); onOnly(o.value); }} title="Solo este">solo</button>
              </label>
            ))}
            {!list.length && <p className="muted small pad-x">Sin opciones.</p>}
          </div>
          {selected.length > 0 && <button className="link small fpop-clear" onClick={onClear}>Quitar filtro de {FACET_LABEL[f].toLowerCase()}</button>}
        </div>
      )}
    </div>
  );
}
