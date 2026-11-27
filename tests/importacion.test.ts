/* Pruebas de lectura de archivos y enlace de estudiantes.
   Cubren errores reales que ya ocurrieron (ver los comentarios de cada caso). */
import { describe, expect, it } from "vitest";
import { parseReport } from "../src/lib/parse";
import { Directory, detectFile, extractPeople, syncPatches } from "../src/lib/directory";
import { gameCode, mergeIgrades, parseIgrades, ultimoT } from "../src/lib/game";
import type { Resultado, RosterEntry } from "../src/lib/types";

const M = ["Pensamiento Crítico", "Resolución de problemas", "Analítica"];

describe("informe de competencias (hoja Informe)", () => {
  const rows = [
    ["Estudiante", "Equipo", "Grupo", "Matrícula", "Carrera", ...M, "Correo", "Índice"],
    ["PÉREZ GÓMEZ, ANA", "Cumbre Cycles", "1593", "A001", "iso", 70, 80, 90, "a@u.edu", 80],
    ["RUIZ, LUIS", "Diseños A&B", "1593", "A002", "Administración", 50, 60, 70, "", 60],
  ];
  const rep = parseReport(rows)!;

  it("conserva las «s» de los equipos (error real: «Cumbre Cycles» pasaba a «Cumbre Cycle»)", () => {
    expect(rep.students.map((s) => s.equipo)).toEqual(["Cumbre Cycles", "Diseños A&B"]);
  });
  it("los códigos de carrera van en mayúsculas y los nombres se respetan", () => {
    expect(rep.students[0].carrera).toBe("ISO");
    expect(rep.students[1].carrera).toBe("Administración");
  });
  it("las columnas informativas (Correo, Índice) no se toman como competencias", () => {
    expect(rep.metrics).toEqual(M);
    expect(rep.students[0].valores).toEqual([70, 80, 90]);
  });
});

describe("listados de estudiantes desordenados", () => {
  const casos: [string, unknown[][], { nombre: string; carrera: string }][] = [
    ["títulos arriba + «Apellidos y Nombres» + «Programa Académico»",
      [["UNIVERSIDAD"], [], ["No.", "Apellidos y Nombres", "Programa Académico", "Nombre del docente"], [1, "PÉREZ GÓMEZ, ANA", "ISO", "X"], [2, "RUIZ DÍAZ, LUIS", "DER", "X"], [3, "SOTO LIMA, EVA", "ISO", "X"]],
      { nombre: "PÉREZ GÓMEZ, ANA", carrera: "ISO" }],
    ["inglés: Student Name / Major",
      [["Student ID", "Student Name", "Major"], ["20251", "Ana Pérez Gómez", "Law"], ["20252", "Luis Ruiz Díaz", "Law"], ["20253", "Eva Soto Lima", "Medicine"]],
      { nombre: "Ana Pérez Gómez", carrera: "Law" }],
    ["sin encabezados (nombre + código)",
      [["Ana Pérez Gómez", "ISO"], ["Luis Ruiz Díaz", "DER"], ["Eva Soto Lima", "ISO"], ["Juan Mota Ramos", "ADM"]],
      { nombre: "Ana Pérez Gómez", carrera: "ISO" }],
    ["encabezados sin sentido («Col1»): la primera fila no es una persona",
      [["Col1", "Col2"], ["Ana Pérez Gómez", "ISO"], ["Luis Ruiz Díaz", "DER"], ["Eva Soto Lima", "ISO"], ["Juan Mota Ramos", "ADM"]],
      { nombre: "Ana Pérez Gómez", carrera: "ISO" }],
  ];
  for (const [nombre, rows, primero] of casos) {
    it(nombre, () => {
      const k = detectFile(rows);
      expect(k.kind).toBe("listado");
      if (k.kind !== "listado") return;
      const ps = extractPeople(rows, k.header, k.mapping);
      expect(ps[0]).toMatchObject(primero);
      expect(ps.every((p) => p.carrera)).toBe(true);
    });
  }
  it("un archivo con solo nombres no se toma como listado", () => {
    expect(detectFile([["Nombre"], ["Ana Pérez Gómez"], ["Luis Ruiz Díaz"]]).kind).toBe("desconocido");
  });
  it("el informe de competencias no se confunde con un listado", () => {
    expect(detectFile([["Estudiante", "Grupo", "Matrícula", "Carrera", ...M], ["Ana", 1, "", "", 1, 2, 3]]).kind).toBe("informe");
  });
});

describe("enlace con el directorio", () => {
  const dir: RosterEntry[] = [
    { nombre: "SEBASTIAN ENRIQUE AQUINO VASQUEZ", matricula: "A1", carrera: "ISC", grupo: "1593", equipo: "", email: "s.aquino10@u.edu", licencia: "" },
    { nombre: "SEBASTIAN SOTO RODRIGUEZ", matricula: "A2", carrera: "NINR", grupo: "1593", equipo: "", email: "s.soto16@u.edu", licencia: "" },
  ];
  it("encuentra a la persona aunque el nombre de la clase no traiga el segundo nombre", () => {
    const f = new Directory(dir).find({ nombre: "Sebastian Aquino Vasquez" });
    expect(f.e?.matricula).toBe("A1");
    expect(f.seguro).toBe(true);
  });
  it("aplica a las clases la carrera por el correo del juego aunque el nombre no coincida", () => {
    const r: Resultado = { id: "r1", clase_id: "c", nombre: "S. Aquino", matricula: "", carrera: "", grupo: "", equipo: "", valores: [] };
    const p = syncPatches([r], dir, new Map([["r1", "s.aquino10@u.edu"]]));
    expect(p[0]).toMatchObject({ id: "r1", carrera: "ISC", matricula: "A1" });
  });
});

describe("informes del juego", () => {
  const igrades = {
    Jugadores: [["Desempeño por Jugadores"], ["Primer nombre", "Apellido", "Correo electrónico", "Empresa", "Resultados del\nTrimestre", "Acumulado(a)\nCuadro\nTarjeta de puntuación integral", "Cuadro\nTarjeta de puntuación integral", "Total Ajustado\nTotal Gastado\n[min]"],
      ["HELEN", "ROSARIO", "h@u.edu", "NEXVELO", 4, 39.7, 38.9, 227]],
  };
  const itimespent = {
    Jugadores: [["Tiempo"], ["Primer nombre", "Apellido", "Correo electrónico", "Empresa", "Tiempo Total Ajustado\n[min]", "Trimestre 1", "Trimestre 2", "Trimestre 3", "Trimestre 4", "Trimestre 5"],
      ["HELEN", "ROSARIO", "h@u.edu", "NEXVELO", 250, 70, 60, 60, 60, 0]],
  };
  it("lee el corte del trimestre y el Scorecard acumulado", () => {
    const g = parseIgrades(igrades)!;
    expect(g.jugadores[0]).toMatchObject({ nombre: "HELEN ROSARIO", trimestres: 4, bsc_acum: 39.7, minutos: 227 });
    expect(g.jugadores[0].historial).toEqual([{ t: 4, bsc_acum: 39.7, bsc: 38.9, minutos: 227, puntaje: null }]);
  });
  it("«Trimestre 1…5» son tiempos por trimestre, no el número de trimestres", () => {
    const g = parseIgrades(itimespent)!;
    expect(g.jugadores[0].tiempos).toEqual([70, 60, 60, 60, 0]);
    expect(g.jugadores[0].trimestres).toBe(4);
  });
  it("une igrades + itimespent del mismo juego sin perder datos", () => {
    const u = mergeIgrades(parseIgrades(igrades)!, parseIgrades(itimespent)!).jugadores[0];
    expect(u.bsc_acum).toBe(39.7);
    expect(u.tiempos).toEqual([70, 60, 60, 60, 0]);
    expect(ultimoT(u)).toBe(4);
  });
  it("saca el código del juego del nombre del archivo", () => {
    expect(gameCode("igrades-29740-00005-73609-q4 (1).xlsx")).toBe("29740-00005-73609");
  });
});
