# Completar el rediseño + opciones de runner — Diseño

Fecha: 2026-05-18
Estado: aprobado
Spec previa relacionada: `2026-05-18-rediseno-dashboard-design.md` (rediseño
visual reducido, ya implementado).

## Contexto

El usuario añadió la carpeta `desing/` (6 archivos: `app.jsx`, `components.jsx`,
`screens.jsx`, `styles.css`, `tweaks-panel.jsx`, `index (1).html`) — el prototipo
visual completo del producto "Probe".

Una sesión previa ya implementó un **subconjunto** de ese diseño: el sistema de
color esmeralda, los componentes base y las 4 pantallas en versión simple. Esa
spec previa recortó a propósito todo lo que no tenía datos de respaldo
(sparklines, cola de tareas, configuración del runner, pestañas Logs/Network,
preview en vivo, columnas extra de tabla).

Esta spec cubre **el delta**: aplicar el resto del `desing/` y conectar de verdad
las opciones de runner que el prototipo introduce. **No se rehace lo ya hecho.**

El producto ya usa el nombre de marca "Probe".

## Alcance

Acordado con el usuario: **Nivel A (completar lo visual que falta) + Nivel B
(opciones de runner reales)**.

**Fuera de alcance** (futuras specs, Nivel C): plantillas guardadas, ejecución
programada, API keys/webhooks, página de Configuración funcional,
facturación/medidor de uso real, detección real de URL, captura de Network,
navegador animado en vivo con streaming CDP. Los elementos de Nivel C que
aparecen en el diseño se muestran en la UI **deshabilitados** ("próximamente"),
no se omiten.

`desing/tweaks-panel.jsx` es andamiaje de la herramienta de prototipado; no se
porta. Tras implementar, la carpeta `desing/` se elimina del repo (era insumo).

## Enfoque

Adaptar al stack existente: Next.js 16 App Router, Tailwind v4 con `@theme`,
componentes en `components/ui/` y `components/runs/`, exports nombrados,
TypeScript strict (sin `any`), validación Zod en toda ruta de API. Los tokens
del `styles.css` del prototipo se mapean a la capa semántica ya existente en
`app/globals.css`; no se porta CSS vanilla.

Las APIs públicas de los componentes ya existentes en `components/ui/` no
cambian, para no romper consumidores fuera del dashboard (landing/login/signup).

## Sección 1 — Modelo de datos

Migración nueva `supabase/migrations/0005_runner_config.sql`. Añade a
`test_runs`:

| Columna          | Tipo                                 | Propósito                                                                                           |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `browser`        | `text not null default 'chromium'`   | Selector de navegador. La columna admite los 3 valores a futuro; este ciclo solo se usa `chromium`. |
| `device`         | `text not null default 'desktop'`    | `desktop` o `mobile` — emulación Playwright.                                                        |
| `retries`        | `smallint not null default 1`        | Reintentos configurables, rango 0–5.                                                                |
| `js_error_count` | `integer not null default 0`         | Métrica de errores JS de consola capturados.                                                        |
| `logs`           | `jsonb not null default '[]'::jsonb` | Stream estructurado de logs: array de `{ ts, level, msg }` con `level ∈ {info, ok, warn, err}`.     |

- No se crean políticas RLS nuevas: las columnas heredan las de `test_runs`.
- `test_runs` ya pertenece a la publication `supabase_realtime` (migración
  `0004`); las actualizaciones de `logs` y `js_error_count` llegan en vivo por la
  suscripción y el `refetch()` ya existentes en `test-run-detail.tsx`.
- La migración se aplica pegando el SQL en el editor de Supabase y debe
  ejecutarse antes de desplegar el worker que escribe las columnas nuevas.

## Sección 2 — Shell (delta)

Estado actual: `sidebar-nav.tsx` tiene `Logo`, botón "Nuevo test run" y 2 ítems
(Resumen, Test runs) bajo una sola sección "Panel". `topbar.tsx` tiene
breadcrumbs, `ThemeToggle` y `UserMenu`.

Cambios:

- **Sidebar**: añadir ítem "En vivo" (enlaza al run activo más reciente; si no
  hay ninguno, deshabilitado). Añadir sección "Cuenta" con ítems "API &
  webhooks" y "Configuración", ambos deshabilitados ("próximamente"). Añadir
  contadores por ítem (nº de runs, punto de pulso en "En vivo"). Añadir medidor
  "Uso del mes" como placeholder estático al pie.
- **Topbar**: añadir tecla `⌘K` decorativa y botón de campana deshabilitado.
  `ThemeToggle` y `UserMenu` se conservan.

## Sección 3 — Pantallas (delta)

### Resumen (`app/dashboard/page.tsx`)

Estado actual: 4 `StatTile` con valores reales, tabla de recientes, breakdown
por tipo, atajos.

Cambios:

- Encabezado: añadir eyebrow y saludo con la parte local del email
  ("Buenas tardes, {local}") — `profiles` no tiene nombre.
- `StatTile`: añadir sparkline. Los datos de la sparkline son **reales**: se
  computan en el server component agrupando por día los hasta 100 runs que
  `page.tsx` ya lee. Sin datos suficientes, el tile se renderiza sin sparkline.
- Añadir tarjeta "Próximas tareas / cola": estado vacío deshabilitado (Nivel C).

### Lista de runs (`app/dashboard/runs/page.tsx` + `_components`)

Estado actual: `RunsTable` con `Tabs` por estado, `Select` por tipo, búsqueda;
las filas se renderizan como grid de `RunRow` (no `<table>`).

Cambios:

- Reestructurar la lista como tabla con columnas: Estado, Tipo, Flujo (URL +
  instrucción), Pasos (conteo real de `test_steps`), Duración, Creado. La
  columna "Disparado" del prototipo (actor CI) se **omite**: aquí siempre es el
  usuario, no se inventan datos.
- Añadir botones "Más filtros" y "Export" deshabilitados (Nivel C).
- La lógica actual de filtrado/búsqueda (`Tabs`, `Select`, query) se conserva.
- "Pasos" requiere conteo de `test_steps` por run; se obtiene en `page.tsx`
  (consulta agregada) y se pasa a la tabla. Si esto encarece la query, se acepta
  resolverlo con una vista o columna agregada en una iteración posterior; este
  ciclo basta con el conteo en la consulta del listado.

### Nuevo run (`new-test-run-form.tsx`)

Estado actual: `FormSection`s numeradas (URL, Tipo, Datos por tipo, Instrucción),
grid de `TypeChip`, campos dinámicos de los 6 tipos.

Cambios:

- Añadir badges de detección de URL ("https", "react·vite", "200 OK") como
  elementos estáticos/decorativos bajo el campo URL (Nivel C).
- Añadir sección **"Configuración del runner"**:
  - Navegador: Chromium activo; Firefox y WebKit como chips deshabilitados.
  - Dispositivo: Desktop / Mobile (funcional).
  - Reintentos: stepper 0–5 (funcional).
  - Modo headless: toggle fijo en "headless", bloqueado, con tooltip que explica
    que el worker corre en un servidor sin pantalla.
- El payload del formulario incluye `browser`, `device`, `retries`.
- Footer: añadir botones "Guardar como plantilla" y "Ejecución programada"
  deshabilitados; "Generar y ejecutar" se conserva funcional.
- Los campos dinámicos de los 6 tipos no cambian funcionalmente.

### Detalle / En vivo (`app/dashboard/runs/[id]` + `_components`)

Estado actual: `test-run-detail.tsx` renderiza una `Card` por `test_case` con
`StepTimeline`, barra de progreso en vivo, lightbox de screenshot, y toda la
lógica de Realtime + `refetch()` de reconciliación.

Cambios — se conserva **intacta** la lógica de Realtime, `refetch()`,
`caseIdsRef`, el intervalo de 3s y el lightbox. Solo cambia la presentación:

- Header del run: añadir badge de tipo y bloques de métricas (Pasos OK,
  duración, errores JS desde `run.js_error_count`).
- **Modo en vivo** (`status` ∈ `pendiente`/`corriendo`): layout de dos columnas
  — izquierda un panel de preview con el **último screenshot real** del paso más
  reciente (no el navegador animado del prototipo); derecha el timeline de pasos
  en tiempo real y un panel de logs en vivo que lee `run.logs`. Se mantiene la
  barra de progreso.
- **Modo detalle** (`status` final): interfaz con pestañas que envuelven todo el
  run:
  - **Pasos**: los timelines por `test_case` actuales (un run puede tener varios
    casos; las pestañas envuelven el run, dentro de "Pasos" se mantienen las
    `Card` por caso con `StepTimeline`).
  - **Logs**: vista terminal construida desde `run.logs`.
  - **Screenshots**: grid con todas las capturas de los pasos.
  - **Network**: pestaña deshabilitada (Nivel C).
- El detalle pasa a leer también las columnas nuevas `logs` y `js_error_count`
  en `page.tsx` y en el `refetch()` (hay que añadirlas a los `select`).

## Sección 4 — Worker y API

### `lib/validation/test-run.ts`

Añadir a `baseFields`:

- `browser`: este ciclo Zod solo acepta `"chromium"` (Firefox/WebKit están
  deshabilitados en la UI). La columna de DB admite los 3 para forward-compat.
- `device`: enum `"desktop"` | `"mobile"`, default `"desktop"`.
- `retries`: entero 0–5, default 1.

Toda entrada sigue validándose con Zod antes de tocar la DB.

### `app/api/test-runs/route.ts`

- Persistir `browser`, `device`, `retries` en el `insert` de `test_runs`.
- Pasarlos al payload del job de BullMQ.
- Sin cambios en el rate limit ni en la lectura del usuario desde la sesión.

### `lib/queue/test-run-queue.ts`

- El `attempts` del job se toma de `retries` (más 1, ya que `attempts` cuenta el
  intento inicial) en lugar de la constante fija.

### `lib/playwright/execute-test-run.ts`

- `device` → emulación Playwright: viewport/userAgent desktop por defecto, o un
  preset móvil (tipo Pixel 5) cuando `device === "mobile"`.
- **Captura de logs**: construir un array estructurado `{ ts, level, msg }`
  durante la corrida (arranque, browser lanzado, plan de la IA, un log por paso,
  cierre) y persistirlo en `test_runs.logs` en checkpoints clave (tras el plan,
  tras cada paso o lote de pasos, al cerrar) para que el modo en vivo lo refleje
  vía el `refetch()` existente. La frecuencia de escritura se mantiene baja para
  no saturar Realtime.
- **Errores JS**: listeners `page.on('pageerror')` y `page.on('console')` (tipo
  `error`) incrementan un contador que se persiste en `js_error_count`.
- La heurística de login adaptativo (`lib/playwright/adaptive-login.ts`) no se
  toca.

### Tests

Cada cambio de API mantiene su test en `/tests/api/` (Vitest + mocks manuales de
Supabase y BullMQ). Se actualiza el test de `POST /api/test-runs` para cubrir los
campos nuevos `browser`/`device`/`retries`.

## Sección 5 — Elementos deshabilitados (Nivel C, visibles pero inertes)

| Elemento                                         | Tratamiento                                          |
| ------------------------------------------------ | ---------------------------------------------------- |
| Sidebar "API & webhooks", "Configuración"        | Ítems visibles, deshabilitados, marca "próximamente" |
| Medidor "Uso del mes"                            | Placeholder estático                                 |
| Topbar `⌘K`, campana                             | Decorativos / sin acción                             |
| Badges de detección de URL                       | Estáticos                                            |
| Firefox / WebKit                                 | Chips deshabilitados                                 |
| "Guardar como plantilla", "Ejecución programada" | Botones deshabilitados                               |
| "Más filtros", "Export" en lista                 | Botones deshabilitados                               |
| Pestaña "Network" en detalle                     | Pestaña deshabilitada                                |
| "Próximas tareas / cola" en Resumen              | Estado vacío deshabilitado                           |
| Columna "Disparado" (actor CI)                   | Omitida (no se inventan datos)                       |

## Componentes nuevos y reutilizados

Nuevos en `components/ui/`: `Sparkline` (SVG de tendencia), `Kbd` (pista de
atajo). Los componentes `StatTile`, `BreakdownBar`, `TypeChip`, `StepTimeline`,
`Tabs`, `Card`, `Badge` ya existen y se reutilizan; si el delta exige extender
sus props, se hace de forma aditiva sin romper la API actual.

## Criterios de éxito

- El dashboard y el flujo de pruebas reflejan el `desing/` completo; los
  elementos de Nivel C aparecen deshabilitados, nunca como controles que fallan
  en silencio.
- `npm run typecheck`, `npm run lint` y `npm run build` pasan; sin `any`, solo
  exports nombrados.
- Un test run puede crearse eligiendo dispositivo y reintentos, y esos valores
  se reflejan en la ejecución real del worker (emulación aplicada, nº de
  reintentos respetado).
- La pestaña Logs del detalle muestra el stream real de la corrida; la métrica
  de errores JS refleja errores de consola reales.
- El Realtime y la reconciliación de `runs/[id]` siguen funcionando (pasos en
  vivo + cierre del hueco de suscripción).
- El test de `POST /api/test-runs` cubre los campos nuevos.

## Riesgos y consideraciones

- El modo claro debe revisarse visualmente: el prototipo es dark-only.
- Reestructurar la lista de runs a `<table>` no debe perder el comportamiento
  responsive ni la navegación por fila ya existentes.
- La captura de logs en checkpoints añade escrituras a `test_runs` durante la
  corrida; mantener la frecuencia baja.
- El conteo de pasos por run en el listado puede encarecer la query del
  listado; aceptable este ciclo, optimizable después con una vista agregada.
