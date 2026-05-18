# Rediseño visual del dashboard — Diseño

**Fecha:** 2026-05-18
**Estado:** aprobado para escribir el plan de implementación
**Alcance:** solo el árbol `/dashboard` + tokens de color globales

---

## 1. Contexto y objetivo

El usuario añadió a la raíz del repo cinco archivos (`app.jsx`, `components.jsx`,
`screens.jsx`, `styles.css`, `tweaks-panel.jsx`) que son la salida de una
herramienta de diseño: un **prototipo visual standalone** (React vía CDN + Babel,
patrón `window.*`, sin TypeScript, CSS hex escrito a mano, datos mock).

El prototipo **no es código integrable**. El proyecto real es Next.js 16 App
Router + TypeScript strict + Tailwind v4 con `@theme` + tokens OKLCH semánticos +
componentes en `components/ui/` + dark/light. El prototipo se trata como
**referencia visual**: se porta su lenguaje (jerarquía, espaciado, componentes,
identidad de color) re-implementándolo en la arquitectura real.

**Objetivo:** elevar la calidad visual de `/dashboard` al nivel del prototipo sin
tocar la lógica de datos, el worker, la cola, Playwright ni el realtime.

### Decisiones tomadas (preguntas de brainstorming)

- **Color:** se adopta la identidad **verde esmeralda** del prototipo como accent
  de marca, en todo el proyecto.
- **Alcance:** **solo `/dashboard`** y sus sub-rutas. Landing, login y signup no
  se rediseñan (sí cambian de color por el accent global — ver §3).
- **Tema:** se conserva **dark + light**. El tema claro no se elimina.

---

## 2. Qué se descarta del prototipo

- `tweaks-panel.jsx` — andamiaje de la herramienta de diseño (bloque `EDITMODE`,
  protocolo `postMessage __edit_mode_*`). No se porta nada.
- El router casero con `switch`, los `window.*` globals, el `ReactDOM.createRoot`.
- Los datos mock (`SEED_RUNS`, `TREND_*`).
- Pantallas del prototipo que no son rutas del proyecto: "En vivo" como ruta
  separada, "Configuración", "API & webhooks". (La vista "en vivo" se integra
  dentro de `runs/[id]`; ver §6.4.)
- Una vez aprobado el plan, los cinco archivos `.jsx`/`.css` de la raíz se
  eliminan del repo (eran insumo, no fuente).

---

## 3. Sistema de color

### 3.1 Tokens

Se reescriben los tokens `--accent*` en `app/globals.css` de naranja arcilla
(hue ~52) a esmeralda (hue ~163), en `:root` (light) y `.dark`. La estructura de
tokens no cambia — solo sus valores. Valores de partida (se ajustan a contraste
WCAG AA durante la implementación):

**Light (`:root`):**
```
--accent:         oklch(0.600 0.142 163);
--accent-hover:   oklch(0.545 0.145 162);
--accent-fg:      oklch(0.990 0.012 165);
--accent-subtle:  oklch(0.945 0.040 165);
--accent-text:    oklch(0.520 0.130 162);
```

**Dark (`.dark`):**
```
--accent:         oklch(0.740 0.145 164);
--accent-hover:   oklch(0.800 0.140 166);
--accent-fg:      oklch(0.240 0.050 165);
--accent-subtle:  oklch(0.300 0.050 163);
--accent-text:    oklch(0.820 0.130 165);
```

Opcional (polish, no bloqueante): re-tintar el hue de los neutrales de ~67 a
~160 a cromas muy bajos, para cohesión subconsciente con el accent.

### 3.2 Colores de estado

El accent ahora es verde y `success`/"completado" también es verde — es
**intencional**. El token `--success` (ya en hue ~158) se mantiene; se distingue
del accent por **componente**, no por hue: los estados viven en *badges*
(píldora con punto + etiqueta mono) y el accent vive en botones llenos y enlaces.
El prototipo demuestra que esta convención se lee sin ambigüedad.

El mapeo estado→token actual de `components/runs/run-status.tsx` se conserva
tal cual; el rediseño no reasigna estados a tokens, solo restiliza los badges.
`completado`→`success` (esmeralda), `fallido`→`danger` (rojo),
`corriendo`→`running` (azul), `pendiente`→`warning` (ámbar).

No existe estado `flaky` en el esquema: se ignora el `flaky` del prototipo.

### 3.3 Consecuencia global

`--accent` es un token global. Al cambiarlo, **landing, login y signup también
pasan a verde** (botones, logo, enlaces, focus ring). Es coherente con la marca
"Probe" y está aceptado. No se mantienen dos identidades de color.

### 3.4 `CLAUDE.md`

Se actualiza la sección "Sistema de diseño y UI": la regla actual dice que el
accent (naranja) nunca se use para "passed". Se reescribe para reflejar que el
accent es esmeralda y que `accent` y `success` comparten familia verde,
distinguiéndose por componente.

---

## 4. Componentes

### 4.1 Componentes nuevos en `components/ui/`

Exports nombrados, tipados, consumiendo tokens vía clases Tailwind (sin estilos
inline con color, sin hex). Cada uno es una unidad aislada y testeable:

- **`Tabs`** — pestañas tipo pill (fondo `surface-2`, thumb activo `elevated`).
  Props: `items: {id, label, count?}[]`, `value`, `onValueChange`. Reutilizable
  en Runs (filtros) y, si aplica, en runs/[id].
- **`StatTile`** — tarjeta de métrica: etiqueta mono en mayúsculas, valor grande
  tabular, punto de color por tono. Props: `label`, `value`, `unit?`, `tone`.
  Sin sparkline (ver §5).
- **`StepTimeline`** — lista vertical de pasos con marcador (ok/fail/run/pend),
  línea conectora, título, descripción mono y duración. Props: `steps`.
- **`TypeChip`** — chip de tipo de prueba (ícono + etiqueta, estado activo).
  Extrae el patrón ya presente en `new-test-run-form.tsx` a un componente.
- **`BreakdownBar`** — fila etiqueta + barra de progreso con gradiente accent.
  Props: `label`, `value`, `max`, `caption?`.

### 4.2 Componentes existentes que se restilizan

`components/ui/` (Button, Input, Field, Badge, Card, Select, Skeleton,
EmptyState, ThemeToggle, icons, logo) y `components/runs/run-status.tsx` se
ajustan al nuevo lenguaje visual (radios, sombras, bordes, énfasis del accent),
**sin cambiar sus APIs públicas** para no romper consumidores fuera del
dashboard.

### 4.3 Iconos

El prototipo trae un set de íconos line-based 1.5px. Se añaden a
`components/ui/icons.tsx` solo los que falten y se usen; se mantiene el estilo
de stroke existente.

---

## 5. Honestidad sobre los datos

El prototipo muestra widgets sin respaldo en la base de datos. Como el alcance
excluye trabajo de backend, estos **no se cablean** y se omiten del rediseño:

- Sparklines / datos de tendencia (`TREND_*`).
- Columna "disparado por" / actor.
- Pestañas "Logs" y "Network" del detalle (no hay logs estructurados por paso
  ni captura de red).
- Contador "errores JS".
- Medidor "uso del mes" en el sidebar.
- Lista "próximas tareas" / cola.
- Preview de navegador en vivo con cursor animado (no se transmite un navegador
  real; el progreso en vivo se representa con la timeline + el realtime ya
  existente).

Widgets del prototipo que **sí** tienen datos reales y se conservan:

- Stat tiles del Resumen — derivados de `test_runs` (total, completados,
  fallidos, en curso).
- Tabla de runs recientes y tabla completa de Runs.
- **Breakdown por tipo de prueba** — se computa en el servidor agrupando las
  filas de `test_runs` por `test_type` (conteo y % de `completado`).
- Timeline de pasos, capturas y mensajes de error en runs/[id].

---

## 6. Pantallas

Statuses reales en DB: runs `pendiente|corriendo|completado|fallido`; steps
`passed|failed|skipped|pendiente|corriendo`. Tipos: `login`, `registro`,
`busqueda`, `navegacion`, `formulario`, `ecommerce`.

### 6.1 Shell (`dashboard-shell`, `sidebar-nav`, `topbar`, `page-header`)

- **Sidebar:** marca (logo viewfinder existente + nombre "Probe" + meta), botón
  primario "Nuevo test run", navegación a las rutas reales únicamente
  (`Resumen` → `/dashboard`, `Test runs` → `/dashboard/runs`). Sin Settings ni
  API. Sin medidor de uso. Conserva el drawer móvil actual.
- **Topbar:** breadcrumbs por ruta, acciones a la derecha. El botón de
  notificaciones del prototipo es decorativo y **se omite**. Se conservan el
  `ThemeToggle` real y el menú de usuario real.
- Layout `flex` con sidebar `w-60` sticky — se mantiene la estructura actual.

### 6.2 Resumen (`app/dashboard/page.tsx`)

- Encabezado con saludo y resumen ("N pruebas, X% pasaron" derivado de filas
  reales).
- Fila de 4 `StatTile`.
- Dos columnas: tabla de runs recientes (izq) + `BreakdownBar` por tipo (der).
- Sección de atajos (cards) que enlazan a `/dashboard/runs/new`.

### 6.3 Test runs (`app/dashboard/runs/page.tsx` + `_components`)

- Encabezado + botón primario.
- Barra de filtros: `Tabs` por estado (Todos / Completados / Fallidos / En
  curso) + búsqueda + (botones "Más filtros"/"Export" decorativos se omiten).
- Tabla restilizada (la lógica de filtrado/búsqueda actual se conserva).

### 6.4 Nuevo run (`app/dashboard/runs/new/_components/new-test-run-form.tsx`)

- Secciones numeradas (Objetivo · Tipo · Datos · Instrucción), restilizadas.
- Grid de `TypeChip` para el tipo de prueba.
- Campos dinámicos por tipo — **sin cambios funcionales**; solo estética.
- Chips de "sugerencias" que anexan texto al prompt (puramente cliente, sin
  backend). La "Configuración del runner" del prototipo (navegador, dispositivo,
  reintentos, headless) **no se incluye**: el endpoint no la soporta.

### 6.5 Detalle del run (`app/dashboard/runs/[id]` + `_components`)

- Header del run: estado, métricas de pasos (passed/failed/pendientes), duración.
- Tarjetas por `test_case` con `StepTimeline` en lugar de la lista `<ol>` actual.
- Visor de captura (lightbox) — se conserva, restilizado.
- **Vista en vivo:** cuando `status` es `pendiente`/`corriendo`, se muestra un
  encabezado de progreso (barra derivada del conteo de pasos) y la timeline se
  va poblando vía el realtime/reconciliación **ya existentes**. No se añade
  pestaña de Logs ni Network ni preview de navegador.
- **Toda la lógica de `test-run-detail.tsx`** (suscripción Realtime,
  `refetch()`, `caseIdsRef`, reconciliación, intervalo de 3s, cierre con Escape)
  se preserva intacta. El rediseño solo cambia el marcado/clases.

---

## 7. Enfoque de implementación

**Token-first, incremental** (elegido sobre big-bang y capa paralela):

1. Reescribir tokens `--accent*` en `globals.css` (light + dark).
2. Restilizar los componentes compartidos de `components/ui/` y
   `components/runs/`.
3. Crear los componentes nuevos (§4.1).
4. Restilizar pantalla por pantalla, cada una como unidad revisable: Shell →
   Resumen → Runs → Nuevo → Detalle.
5. Actualizar la sección de diseño de `CLAUDE.md`.
6. Eliminar los cinco archivos de prototipo de la raíz.

Cada paso deja la app compilando (`npm run typecheck`, `npm run lint`,
`npm run build`).

---

## 8. Lo que NO se toca

Rutas de API, worker, Playwright, BullMQ/Upstash, lógica de Supabase
(`lib/supabase/*`), realtime y reconciliación, validación Zod, esquema de DB,
landing/login/signup (más allá del recoloreo automático del accent), y las APIs
públicas de los componentes de `components/ui/`.

---

## 9. Criterios de aceptación

- `npm run typecheck`, `npm run lint` y `npm run build` pasan sin errores ni
  `any`.
- Dark y light se ven correctos; el contraste de texto cumple WCAG AA.
- El accent es esmeralda en todo el proyecto; `passed/completado` es verde y
  legible junto a botones de accent.
- `/dashboard`, `/dashboard/runs`, `/dashboard/runs/new` y
  `/dashboard/runs/[id]` reflejan el lenguaje visual del prototipo.
- El realtime de `runs/[id]` sigue funcionando (pasos en vivo + reconciliación).
- No se hardcodean colores ni hex; todo vía tokens. Sin estilos inline de color.
- `CLAUDE.md` queda coherente con el nuevo sistema de color.
