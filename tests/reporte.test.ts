/* Pruebas del reporte ejecutivo */
import { describe, expect, it } from "vitest";
import { asignaturaDe } from "../src/lib/reporte";
import { puedeVerReporte } from "../src/lib/permisos";

describe("reporte ejecutivo", () => {
  it("reconoce la asignatura en el nombre de la clase", () => {
    expect(asignaturaDe("CFel-ADM535-2176")).toBe("ADM535");
    expect(asignaturaDe("JRav-ADM535-1593GR")).toBe("ADM535");
    expect(asignaturaDe("Algoritmos Avanzados")).toBeNull();
  });
  it("administración siempre; coordinadores si se permite; docentes nunca", () => {
    expect(puedeVerReporte("admin", { reporteCoordinadores: false })).toBe(true);
    expect(puedeVerReporte("decano", {})).toBe(true);
    expect(puedeVerReporte("decano", { reporteCoordinadores: false })).toBe(false);
    expect(puedeVerReporte("maestro", {})).toBe(false);
  });
});
