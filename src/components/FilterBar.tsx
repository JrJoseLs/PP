/* Barra de filtros del ámbito: buscador con sugerencias + filtros encadenados con conteos.
   Escribir "biki" sugiere "Equipo: BIKING (8)"; elegirlo lo convierte en una píldora.
   Cada menú (Clase, Carrera, Grupo, Equipo, Nivel) muestra solo lo que existe con los demás filtros.
   En Comparar, la misma barra también AÑADE a la comparación (prop `compare`): así hay un solo buscador. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "../data/store";
import { Icon } from "./ui";
import { displayName, normText, plural } from "../lib/metrics";
import { EMPTY_SCOPE, FACETS, FACET_LABEL, facetLabel, facetOptions, scopeActive, useScoped, type Facet, type Option } from "../lib/scope";
import { useShell } from "./Layout";

/** Modo comparar: claves "clase:<id>", "carrera:<nombre>", "grupo:<g>", "equipo:<e>", "est:<id>", "maestro:<id>"… */
export interface CompareMode {
  selected: string[];
  full: boolean;
  toggle(key: string): void;
  /** Sugerencias extra que solo se pueden comparar (p. ej. personas) */
  extra?(n: string): { key: string; label: string; sub: string }[];
}
export const FILTER_INPUT_ID = "fbar-input";

export default function FilterBar({ facets = FACETS, summary, right, compare }: { facets?: Facet[]; summary?: ReactNode; right?: ReactNode; compare?: CompareMode }) {
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
  const cmpKey = (f: Facet, v: string) => (f === "nivel" ? undefined : `${f}:${v}`);

  /* sugerencias: valores de filtros que coinciden, personas (en Comparar) y estudiantes */
  type Sug = { key: string; kind: Facet | "est" | "texto" | "persona"; label: string; sub: string; filter?(): void; cmp?: string; open?(): void };
  const sugs = useMemo<Sug[]>(() => {
    const n = normText(text);
    if (!n) return [];
    const out: Sug[] = [];
    shown.forEach((f) => facetOptions(allRows, scope, f, snap.clases)
      .filter((o) => o.count > 0 && !scope[f].includes(o.value) && normText(o.label).includes(n)).slice(0, 4)
      .forEach((o) => out.push({ key: f + o.value, kind: f, label: o.label, sub: `${FACET_LABEL[f]} · ${plural(o.count, "estudiante", "estudiantes")}`,
        filter: () => toggle(f, o.value), cmp: compare ? cmpKey(f, o.value) : undefined })));
    compare?.extra?.(n).slice(0, 4).forEach((x) => out.push({ key: x.key, kind: "persona", label: x.label, sub: x.sub, cmp: x.key }));
    rows.filter((r) => r.q.includes(n)).slice(0, 5).forEach((r) => out.push({ key: "e" + r.r.id, kind: "est", label: displayName(r.r.nombre),
      sub: `Estudiante · ${r.cls.nombre}`, open: () => openStudent(r.r.id), cmp: compare ? "est:" + r.r.id : undefined }));
    out.push({ key: "texto", kind: "texto", label: `Buscar «${text}» en todo`, sub: "Filtra por nombre, matrícula, grupo, equipo o clase",
      filter: () => setScope({ ...scope, q: text.trim() }) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, scope, allRows, rows, snap.clases, compare]);
  useEffect(() => setSel(0), [text]);

  /** Acción principal: en Comparar se añade; en el resto se filtra (o se abre el estudiante) */
  const main = (s: Sug) => {
    if (compare && s.cmp) compare.toggle(s.cmp);
    else if (s.filter) s.filter();
    else s.open?.();
    setText("");
    if (!compare || !s.cmp) setOpen(false);
  };
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
          <input id={FILTER_INPUT_ID} value={text} autoComplete="off"
            placeholder={compare ? "Busca una clase, carrera, equipo, persona o estudiante para compararlo o filtrar…" : active ? "Añadir filtro…" : "Busca una clase, carrera, equipo, grupo o estudiante…"}
            onChange={(e) => { setText(e.target.value); setOpen(true); setMenu(null); }} onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(sugs.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter" && sugs[sel]) { e.preventDefault(); main(sugs[sel]); }
              else if (e.key === "Escape") { setOpen(false); setText(""); }
              else if (e.key === "Backspace" && !text && chips.length) { const c = chips[chips.length - 1]; toggle(c.f, c.v); }
            }} />
        </div>
        {active && <button className="link small" onClick={() => setScope(EMPTY_SCOPE)}>Limpiar</button>}
        {open && sugs.length > 0 && (
          <div className="fbar-sug">
            {sugs.map((s, i) => {
              const inCmp = !!(compare && s.cmp && compare.selected.includes(s.cmp));
              return (
                <div key={s.key} className={"sug" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onMouseDown={(e) => e.preventDefault()}>
                  <button className="sug-main" onClick={() => main(s)}>
                    <span className={"sug-ico f-" + s.kind}><Icon name={s.kind === "est" ? "students" : s.kind === "texto" ? "search" : s.kind === "clase" ? "classes" : s.kind === "equipo" || s.kind === "persona" ? "team" : "spark"} size={14} /></span>
                    <span className="rank-txt"><b>{s.label}</b><small>{s.sub}</small></span>
                  </button>
                  {compare && s.cmp && (
                    <button className={"sug-act" + (inCmp ? " on" : "")} disabled={!inCmp && compare.full} onClick={() => { compare.toggle(s.cmp!); setText(""); }}>
                      {inCmp ? <><Icon name="check" size={12} /> Comparando</> : <><Icon name="plus" size={12} /> Comparar</>}
                    </button>
                  )}
                  {compare && s.filter && <button className="sug-act ghost" onClick={() => { s.filter!(); setText(""); }}>Filtrar</button>}
                  {compare && s.open && <button className="sug-act ghost" onClick={() => { s.open!(); setText(""); setOpen(false); }}>Perfil</button>}
                </div>
              );
            })}
            {compare && <p className="sug-hint">Enter añade a la comparación · «Filtrar» limita lo que se compara</p>}
          </div>
        )}
      </div>
      <div className="fbar-row">
        {shown.map((f) => (
          <FacetMenu key={f} f={f} open={menu === f} onOpen={() => { setMenu(menu === f ? null : f); setOpen(false); }}
            options={facetOptions(allRows, scope, f, snap.clases)} selected={scope[f]} onToggle={(v) => toggle(f, v)}
            onOnly={(v) => setScope({ ...scope, [f]: [v] })} onClear={() => setScope({ ...scope, [f]: [] })}
            compare={compare && f !== "nivel" ? { selected: compare.selected, full: compare.full, toggle: (v) => compare.toggle(`${f}:${v}`), key: (v) => `${f}:${v}` } : undefined} />
        ))}
        {summary && <span className="fbar-sum">{summary}</span>}
        {right && <span className="fbar-right">{right}</span>}
      </div>
    </div>
  );
}

function FacetMenu({ f, open, onOpen, options, selected, onToggle, onOnly, onClear, compare }: {
  f: Facet; open: boolean; onOpen(): void; options: Option[]; selected: string[]; onToggle(v: string): void; onOnly(v: string): void; onClear(): void;
  compare?: { selected: string[]; full: boolean; toggle(v: string): void; key(v: string): string };
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
          {compare && <p className="muted tiny pad-x fpop-help">☐ filtra · <b>+</b> añade a la comparación</p>}
          <div className="fpop-list">
            {list.map((o) => {
              const inCmp = !!compare?.selected.includes(compare.key(o.value));
              return (
                <label key={o.value} className={"fopt" + (o.count === 0 ? " zero" : "") + (compare ? " cmp" : "")}>
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
                  <span className="fopt-l">{o.label}</span>
                  <span className="fopt-n">{o.count}</span>
                  {compare
                    ? <button className={"fopt-cmp" + (inCmp ? " on" : "")} disabled={!inCmp && (compare.full || o.count === 0)} onClick={(e) => { e.preventDefault(); compare.toggle(o.value); }}
                        title={inCmp ? "Quitar de la comparación" : "Añadir a la comparación"}>{inCmp ? <Icon name="check" size={12} /> : <Icon name="plus" size={12} />}</button>
                    : <button className="fopt-only" onClick={(e) => { e.preventDefault(); onOnly(o.value); }} title="Solo este">solo</button>}
                </label>
              );
            })}
            {!list.length && <p className="muted small pad-x">Sin opciones.</p>}
          </div>
          {selected.length > 0 && <button className="link small fpop-clear" onClick={onClear}>Quitar filtro de {FACET_LABEL[f].toLowerCase()}</button>}
        </div>
      )}
    </div>
  );
}
