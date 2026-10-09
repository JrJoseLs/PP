# Competencias

Plataforma para analizar los informes de competencias del juego por **clase, maestro, decano, carrera y estudiante**, con gráficos araña interactivos y control de acceso jerárquico.

```
Administración ──► carga clases (Excel) y las entrega a decanos
   └─ Decano/a ──► ve SOLO sus clases y SOLO sus maestros; asigna cada clase a un maestro
        └─ Maestro/a ──► ve SOLO las clases que su decano le asignó
```

- **Front:** React + TypeScript + Vite, publicado gratis en **GitHub Pages**.
- **Backend:** **Supabase** (Postgres + Auth + Edge Functions), plan gratuito.
- **Modo demo:** sin configurar nada, la app funciona con datos de ejemplo en el navegador (4 decanos, 16 maestros, 16 clases). Contraseña de todas las cuentas demo: `demo`.

---

## ¿Por qué Supabase y no Firebase?

| | Supabase | Firebase |
|---|---|---|
| Permisos jerárquicos (admin → decano → maestro → clase) | **Row Level Security en SQL**: una regla como “el decano ve la clase si está en `clase_decanos`” es una línea. | Reglas de Firestore: los *joins* (clase ↔ decano ↔ maestro) obligan a duplicar datos o hacer lecturas extra en cada regla. |
| Comparaciones y promedios | SQL real, si algún día se quieren vistas o reportes en el servidor. | Consultas limitadas. |
| Plan gratis | 500 MB de base de datos, 50.000 usuarios activos/mes, Edge Functions incluidas. | Generoso, pero Cloud Functions exige el plan de pago (Blaze). |
| Ojo | Un proyecto gratis **se pausa tras 7 días sin uso**; se reactiva con un clic en el panel. | — |

Para este volumen (cientos o miles de estudiantes) el plan gratis sobra.

---

## Puesta en marcha

### 1. Probar en local

```bash
npm install
npm run dev          # http://localhost:5173  (modo demo)
```

### 2. Crear el backend (≈10 min, gratis)

1. Crea un proyecto en <https://supabase.com> (región cercana, p. ej. `us-east-1`).
2. **SQL Editor → New query**: pega el contenido de [`supabase/migrations/001_esquema.sql`](supabase/migrations/001_esquema.sql) y pulsa **Run**.
3. **Authentication → Sign In / Providers → Email**: desactiva **“Allow new users to sign up”** (las cuentas solo las crean administración y los decanos) y desactiva **“Confirm email”**.
4. Despliega la función que crea las cuentas, con **Verify JWT apagado** (desde el panel: *Edge Functions → Deploy a new function → Via Editor*, o con la [CLI de Supabase](https://supabase.com/docs/guides/cli)). Su nombre debe coincidir con `USERS_FN` en `src/data/supabaseApi.ts`:
   ```bash
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase functions deploy manage-users --no-verify-jwt
   ```
5. **Primer administrador:** en **Authentication → Users → Add user** crea `admin@pp.local` con una contraseña fuerte y marca *Auto Confirm*. **El primer usuario que exista se convierte automáticamente en administrador.** Entra en la app con el usuario `admin`.
6. **Project Settings → API**: copia la *Project URL* y la llave *anon public*.

### 3. Conectar el front

- **En local:** copia `.env.example` como `.env.local` y pega los dos valores.
- **En GitHub Pages:** repositorio → **Settings → Secrets and variables → Actions → Variables** → crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

> La llave *anon* es pública por diseño: sin una sesión válida no da acceso a nada, y con sesión solo devuelve lo que permiten las políticas RLS.

### 4. Publicar en GitHub Pages

1. Repositorio → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Haz push a `main`. El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) compila y publica en `https://<usuario>.github.io/PP/`.
3. Para enseñar la demo aunque la nube esté configurada: `https://<usuario>.github.io/PP/?demo`.

### 5. Dominio propio gratis con DuckDNS (opcional)

1. Entra en <https://www.duckdns.org> y crea un subdominio, p. ej. `competencias.duckdns.org`.
2. En el campo **current ip** pon `185.199.108.153` (una IP de GitHub Pages) y pulsa *update ip*.
3. En GitHub → **Settings → Pages → Custom domain** escribe `competencias.duckdns.org` y guarda. Cuando GitHub termine la comprobación, activa **Enforce HTTPS** (el certificado puede tardar hasta 24 h).
4. Agrega el archivo `public/CNAME` con el dominio (una sola línea) para que no se pierda en cada despliegue.

DuckDNS solo admite registros A (IP), no CNAME; por eso se apunta a la IP de GitHub Pages. Si GitHub cambiara sus IP, actualízala en DuckDNS.

---

## Uso

1. **Administración → Importar:** arrastra el listado (`ADM535`) y los informes (`icompetencyreport…`). El tipo de archivo se detecta solo. Ponle nombre a cada clase, elige su decano y guarda.
2. **Administración → Equipo:** crea las cuentas de decanos y maestros. En *Organización* arrastra cada maestro a la columna de su decano.
3. **Decano → Equipo → Acceso a clases:** marca qué clase ve cada uno de sus maestros.
4. **Plantillas Excel** (Importar → Plantillas): informe de competencias, listado de estudiantes y cuentas de usuario, cada una con su hoja de instrucciones. Las filas que empiezan por `EJEMPLO` se ignoran.
   - Para **corregir una clase**: ábrela → *Descargar Excel* → edítalo → súbelo en Importar. Si el archivo se llama igual que la clase, la app propone *Reemplazar datos* y conserva su nombre, color y accesos.
   - Para **crear muchas cuentas**: Equipo → *Importar cuentas*. Al terminar descargas un Excel con usuarios y contraseñas.
5. Todos: **Inicio** (hallazgos automáticos), **Clases**, **Comparar** (hasta 8 series en el radar: clases, maestros, decanos, carreras, grupos o estudiantes), **Estudiantes** (mapa de calor y exportación a Excel). <kbd>⌘K</kbd> o <kbd>/</kbd> abre la búsqueda global.

### Cómo se leen los números

- **Índice general** = promedio de las competencias positivas (0–100). Niveles: bajo < 34 · medio 34–65 · alto ≥ 66.
- Las competencias marcadas con **↓** (Margen de mejora, Oportunidad perdida, Falta de previsión, Luchado, Insuficiente, Retrasar) son **de riesgo**: un valor bajo es mejor y no cuentan en el índice. En el radar, la opción *Más afuera = mejor* las invierte para que una figura más grande signifique siempre mejor rendimiento.
- Las competencias que casi nadie activa (p. ej. *Fénix*, 0 en el 70 % o más) se ocultan de los radares de resumen.

## Seguridad y privacidad

- Los permisos se aplican **en la base de datos** (RLS): un maestro no puede leer otra clase aunque manipule el navegador. Ver [`001_esquema.sql`](supabase/migrations/001_esquema.sql).
- Crear cuentas y cambiar contraseñas requiere la llave de servicio, que solo vive en la Edge Function, nunca en el navegador.
- Los Excel se procesan en el navegador; solo se guardan nombre, matrícula, carrera, grupo y valores de competencias. El listado institucional (teléfonos, correos…) **no** se guarda: de él solo se toman esos cuatro campos, visibles únicamente para administración.
- `*.xlsx`, `*.csv` y `.env*` están en `.gitignore`: los datos nunca llegan al repositorio.

## Estructura

```
src/
  data/        api.ts (interfaz común) · supabaseApi.ts · demoApi.ts (mismas reglas que RLS) · demoSeed.ts · store.tsx
  lib/         metrics.ts (índice, niveles, riesgo) · parse.ts (lectura de Excel) · groups.ts
  components/  Radar.tsx (araña animada e interactiva) · Charts.tsx · Backdrop3D.tsx (three.js) · Layout.tsx (⌘K) · StudentSheet.tsx
  pages/       Dashboard · Clases · ClaseDetalle · Comparar · Estudiantes · Equipo · Importar · Ajustes · Login
supabase/      migrations/001_esquema.sql · functions/manage-users
legacy/        versión anterior (HTML + JS, cifrado en el navegador), como referencia
```
