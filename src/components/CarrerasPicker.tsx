/* Selector de carreras: casillas ordenadas en cuadrícula, con «Todas / Ninguna», buscador y contador. */
import { useState } from "react";
import { Icon } from "./ui";

export function CarrerasPicker({ codigos, nombres, value, onChange }: {
  codigos: string[];
  nombres: Map<string, string>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const sel = new Set(value.map((x) => x.toUpperCase()));
  const t = q.trim().toLowerCase();
  const visibles = t ? codigos.filter((c) => c.toLowerCase().includes(t) || (nombres.get(c) ?? "").toLowerCase().includes(t)) : codigos;
  const todas = visibles.length > 0 && visibles.every((c) => sel.has(c));
  const set = (cs: string[], on: boolean) => {
    const s = new Set(sel); cs.forEach((c) => (on ? s.add(c) : s.delete(c)));
    onChange(codigos.filter((c) => s.has(c)));
  };
  return (
    <div className="carpick">
      <div className="carpick-bar">
        <span className="carpick-n"><b>{sel.size}</b> de {codigos.length}</span>
        {codigos.length > 10 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar carrera…" />}
        <button type="button" className="rp-link" disabled={todas} onClick={() => set(visibles, true)}>{t ? "Marcar estas" : "Todas"}</button>
        <button type="button" className="rp-link" disabled={!visibles.some((c) => sel.has(c))} onClick={() => set(visibles, false)}>Ninguna</button>
      </div>
      <div className="carpick-grid">
        {visibles.map((c) => {
          const on = sel.has(c), n = nombres.get(c);
          return (
            <button type="button" key={c} className={"carpick-it" + (on ? " on" : "")} aria-pressed={on} title={n && n !== c ? `${c} · ${n}` : c} onClick={() => set([c], !on)}>
              <i>{on && <Icon name="check" size={11} />}</i>
              <b>{c}</b>
              {n && n.toUpperCase() !== c && <small>{n}</small>}
            </button>
          );
        })}
        {!visibles.length && <p className="muted small">Ninguna carrera coincide.</p>}
      </div>
    </div>
  );
}
