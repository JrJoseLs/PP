# Extensión «Marketplace – Exportador de Competencias»: protocolo v2

Esta nota es para quien mantiene la extensión de Chrome. Explica qué cambió en el comparador y qué hay que ajustar en la extensión para enviar también los informes del juego.

## Qué sigue igual

- La extensión se comunica con la pestaña del comparador mediante `window.postMessage`, siempre en el mismo origen.
- Los tres mensajes son los mismos:

| Dirección | Mensaje | Contenido |
|---|---|---|
| página → extensión | `MARKETPLACE_JR_READY` | La pantalla de importación está lista. **Nuevo:** incluye `version: 2` y `acepta: ["competencias", "igrades", "itimespent"]` |
| extensión → página | `MARKETPLACE_JR_IMPORT` | `{ payload }` (ver más abajo) |
| página → extensión | `MARKETPLACE_JR_RECEIVED` | `{ requestId }`: recibido, no lo vuelvas a enviar |

- El **informe de competencias** se envía igual que ahora: `payload = { requestId, filename, rows }`, con las columnas `Estudiante | Empresa | Matrícula | Carrera | competencias (0–100)`.
- Nada se guarda solo. Todo entra como vista previa en **Importar** y el administrador confirma.

## Qué hay que añadir: informes del juego

El comparador ahora usa dos informes más de Marketplace:

| Informe | Archivo original | Hojas | Para qué |
|---|---|---|---|
| Desempeño de la Simulación | `igrades-<juego>-q<N>.xlsx` | «Desempeño por Equipos» y «Desempeño por Jugadores» | Scorecard acumulado y trimestre alcanzado |
| Tiempo gastado | `itimespent-<juego>-q<N>.xlsx` | «Tiempo Gastado por Equipos» y «… por Jugadores» | Tiempo de cada trimestre |

Para enviarlos se usa un payload con **`sheets` en lugar de `rows`**:

```js
window.postMessage({
  type: "MARKETPLACE_JR_IMPORT",
  payload: {
    requestId: crypto.randomUUID(),
    filename: "igrades-29740-00005-73609-q4.xlsx",   // ← el nombre ORIGINAL de Marketplace
    sheets: {
      "Desempeño por Equipos":   [[...fila 1], [...encabezados], [...una fila por equipo]],
      "Desempeño por Jugadores": [[...fila 1], [...encabezados], [...una fila por jugador]]
    }
  }
}, location.origin);
```

Reglas:

1. **El `filename` debe ser el original** (`igrades-…`, `itimespent-…`), con el código del juego y el trimestre (`-q4`). El comparador usa ese nombre para:
   - unir el igrades y el itimespent del mismo juego en una sola tarjeta;
   - sumar cada trimestre al historial de la clase;
   - proponer el nombre de la clase («Clase 29740-00005-73609»).
2. **Las hojas van tal cual**, con todas sus filas: título, encabezados y datos. No hace falta reordenar ni renombrar columnas; el comparador reconoce los encabezados en español o en inglés.
3. Las celdas solo pueden ser texto (hasta 500 caracteres), número, booleano o vacío. Límites: 12 hojas por libro, 10 000 filas por hoja y 80 columnas.
4. **Un mensaje por archivo.** Si se envían el igrades y el itimespent seguidos, el comparador los une solo.
5. Hay que esperar `MARKETPLACE_JR_RECEIVED` con el mismo `requestId` antes de dar el envío por hecho, igual que ahora.

## Nombre de la clase de Marketplace (v3.5)

Para que el Desempeño y las Competencias de una misma clase terminen en **la misma clase** del comparador, la extensión puede indicar el nombre que muestra Marketplace (`#gameSwitcherMenuTitle`, por ejemplo `jser-MKTJun26`). Hay dos formas de hacerlo, y el comparador acepta ambas:

- **Si carga el archivo en el campo de Importar:** antes de disparar `change`, poner `input.dataset.marketplaceClass = "jser-MKTJun26"`. El comparador lo lee y lo borra.
- **Si usa mensajes:** añadir `clase: "jser-MKTJun26"` al `payload`.

Qué hace el comparador con ese nombre (nunca guarda solo):
- Si hay **una** clase con ese nombre, la propone como destino.
- Si hay **varias**, no elige ninguna y pide al usuario que escoja.
- Si no hay ninguna, propone **Clase nueva** con ese nombre. Solo completa el grupo cuando el directorio da el mismo grupo para todos los jugadores.
- Al guardar, si ya existe una clase con ese nombre, la usa en lugar de crear otra.
- Solo acepta nombres de letras, números y `. _ -` (hasta 100 caracteres). Cualquier otra cosa se descarta.

El informe de competencias enviado como `Informe_Competencias_jser-MKTJun26.xlsx` se asocia solo con esa misma clase.

## Datos que el comparador usa (y los que no)

- **Usa:** nombre, apellido, correo, empresa (equipo), «Resultados del Trimestre» (trimestre alcanzado), el **Scorecard acumulado** y el **tiempo** (total y por trimestre).
- **No muestra:** puntaje, percentil ni el Scorecard del último trimestre, porque dependen de la dificultad configurada. Si vienen en el libro no pasa nada: se ignoran.
- Si un jugador no llegó al último trimestre de la clase, o no está en el informe de competencias, el comparador lo registra en «Fuera de los gráficos» y no lo usa en promedios. No hace falta filtrarlo en la extensión.

## Compatibilidad

- Una extensión que solo envía `rows` (competencias) sigue funcionando sin cambios.
- Para saber si la página acepta `sheets`, la extensión puede leer `version >= 2` en el mensaje `MARKETPLACE_JR_READY`.
