import { useEffect, useState } from "react";
import { Icon } from "./ui";

export type ThemePref = "system" | "light" | "dark";
const KEY = "pp_theme";

export function getThemePref(): ThemePref {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '"system"'); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
}
function resolved(p: ThemePref) {
  return p === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : p;
}
export function applyTheme(p: ThemePref) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ }
  document.documentElement.setAttribute("data-theme", resolved(p));
  window.dispatchEvent(new Event("pp-theme"));
}
export function useTheme(): [ThemePref, (p: ThemePref) => void, "light" | "dark"] {
  const [pref, setPref] = useState(getThemePref);
  const [res, setRes] = useState<"light" | "dark">(resolved(pref));
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { const p = getThemePref(); setPref(p); setRes(resolved(p)); if (p === "system") document.documentElement.setAttribute("data-theme", resolved(p)); };
    mq.addEventListener("change", sync); window.addEventListener("pp-theme", sync);
    return () => { mq.removeEventListener("change", sync); window.removeEventListener("pp-theme", sync); };
  }, []);
  return [pref, applyTheme, res];
}

export function ThemeButton() {
  const [, set, res] = useTheme();
  return (
    <button type="button" className="icon-btn" aria-label="Cambiar tema" title={res === "dark" ? "Tema claro" : "Tema oscuro"}
      onClick={() => set(res === "dark" ? "light" : "dark")}>
      <Icon name={res === "dark" ? "sun" : "moon"} />
    </button>
  );
}
