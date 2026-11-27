/* Pruebas del CRR ponderado por carrera */
import { describe, expect, it } from "vitest";
import { COMPETENCIAS, aCien, codigoPerfil, crrDe, crrPonderado, indiceGeneral, leerPerfil, repartir, repartirIgual, setPerfiles, totalPesos } from "../src/lib/perfiles";
import { normText } from "../src/lib/metrics";

const claves = ["Resolución de problemas", "Razonamiento Deductivo", "Analítica", "Agilidad de Aprendizaje", "Innovación"];

describe("reparto de los 100 puntos", () => {
  it("las claves reciben el % elegido y el resto se reparte entre las otras 19; suma exactamente 100", () => {
    const p = repartir(claves, 35);
    expect(totalPesos(p)).toBe(100);
    expect(Object.keys(p)).toHaveLength(24);
    const enClaves = claves.reduce((a, c) => a + p[normText(c)], 0);
    expect(enClaves).toBeCloseTo(35, 0);
    expect(p[normText("Tenacidad")]).toBeCloseTo(65 / 19, 1);
  });
  it("sin claves, todas valen lo mismo", () => {
    const p = repartir([], 35);
    expect(totalPesos(p)).toBe(100);
    // 100 / 24 = 4,17: todas quedan en 4,1 o 4,2 (ninguna se lleva todo el redondeo)
    expect(Math.max(...Object.values(p)) - Math.min(...Object.values(p))).toBeLessThanOrEqual(0.1 + 1e-9);
  });
  it("«Ajustar a 100» escala proporcionalmente", () => {
    const p = aCien({ a: 10, b: 30 });
    expect(p).toEqual({ a: 25, b: 75 });
  });
  it("partes iguales suma 100", () => expect(totalPesos(repartirIgual())).toBe(100));
});

describe("CRR ponderado", () => {
  const metrics = ["Pensamiento Crítico", "Retrasar"]; // positiva y de riesgo
  it("las de riesgo cuentan invertidas (menos es mejor)", () => {
    // 50 % del peso a cada una: (80 + (100 − 20)) / 2 = 80
    expect(crrPonderado(metrics, [80, 20], { [normText("Pensamiento Crítico")]: 50, [normText("Retrasar")]: 50 })).toBe(80);
  });
  it("si falta una competencia, su peso se reparte entre las presentes", () => {
    expect(crrPonderado(["Pensamiento Crítico"], [70], { [normText("Pensamiento Crítico")]: 10, [normText("Analítica")]: 90 })).toBe(70);
  });
  it("las casi vacías de la clase no cuentan", () => {
    const pesos = { [normText("Pensamiento Crítico")]: 50, [normText("Fénix")]: 50 };
    expect(crrPonderado(["Pensamiento Crítico", "Fénix"], [60, 0], pesos, new Set(["Fénix"]))).toBe(60);
  });
  it("el índice general es el promedio simple de las positivas", () => {
    expect(indiceGeneral(["Pensamiento Crítico", "Analítica", "Retrasar"], [60, 80, 90])).toBe(70);
  });
});

describe("qué perfil usa cada carrera", () => {
  it("las variantes R/S usan el de su base; los nombres completos también se reconocen", () => {
    setPerfiles(null, undefined); // perfiles de partida
    expect(codigoPerfil("ISOR")).toBe("ISO");
    expect(codigoPerfil("ATHS")).toBe("ATH");
    expect(codigoPerfil("Administración")).toBe("ADM");
    expect(codigoPerfil("ZZZ")).toBeNull();
  });
  it("sin perfil, el CRR es el índice general", () => {
    setPerfiles(null, undefined);
    const r = crrDe(["Pensamiento Crítico", "Analítica"], [60, 80], "ZZZ");
    expect(r).toEqual({ crr: 70, general: 70, codigo: null });
  });
  it("lee perfiles antiguos (solo claves) y les calcula los pesos", () => {
    const p = leerPerfil({ nombre: "X", claves })!;
    expect(totalPesos(p.pesos)).toBe(100);
    expect(p.modo).toBe("auto");
  });
  it("las 24 competencias del informe están en el reparto", () => expect(COMPETENCIAS).toHaveLength(24));
});
