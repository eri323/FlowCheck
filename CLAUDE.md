@AGENTS.md
# Plataforma de Testing Automatizado con IA — CLAUDE.md

## Qué es este proyecto

Plataforma web donde el usuario pega una URL y describe un flujo en lenguaje natural.
El sistema llama a la API de Gemini para generar casos de prueba en Playwright, los ejecuta
en un navegador headless y devuelve un reporte en vivo con screenshots por cada paso.

Equivalente real: Testim.io, Mabl, Reflect.run — pero construido desde cero.

---

## Arquitectura

```
frontend/          → Next.js 16 App Router + Tailwind CSS v4 + TypeScript
backend/           → API Routes de Next.js (mismo repo, /app/api/)
worker/            → Servidor Express HTTP independiente (Render) — ejecuta Playwright
```

Monorepo. El frontend y las rutas de API viven en Next.js. El worker es un
servidor Express desplegado en Render: la API Route inserta el `test_run` y
delega vía `POST /run-test` para no bloquear el ciclo request/response de
Vercel (los jobs duran 30–60s).

---

## Stack

| Capa           | Tecnología              |
|----------------|-------------------------|
| Frontend       | Next.js 16, Tailwind v4 |
| Auth + DB      | Supabase                |
| Tiempo real    | Supabase Realtime       |
| Archivos       | Supabase Storage        |
| IA             | @google/genai (Gemini)  |
| Tests browser  | Playwright (Chromium)   |
| Worker         | Express HTTP            |
| Deploy front   | Vercel                  |
| Deploy worker  | Render (free, render.yaml) |
| Lenguaje       | TypeScript en todo      |

---

## Comandos principales

```bash
npm run dev          # Inicia servidor de desarrollo Next.js (puerto 3000)
npm run build        # Build de producción
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm test             # Vitest (tests de API en /tests)
npm run test:watch   # Vitest en modo watch
```

---

## Tablas en Supabase

- `profiles` — vinculado a auth.users, guarda plan y rol del usuario
- `projects` — cada usuario tiene proyectos (nombre, url objetivo)
- `test_runs` — un registro por ejecución (status, created_at, user_id,
  browser, device, logs, js_error_count)
- `test_cases` — generados por la IA, pertenecen a un test_run
- `test_steps` — cada paso de un test_case (acción, selector, status, screenshot_url)

Row Level Security activado en todas las tablas. Cada usuario solo ve sus propios datos.

---

## Variables de entorno

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # solo backend/worker, nunca en el cliente

# Gemini (Google AI Studio)
GEMINI_API_KEY=                  # solo worker, nunca en el cliente

# Worker en Render (la API Route lo contacta vía HTTP)
WORKER_URL=
WORKER_SECRET=                   # secreto compartido; también en el worker
```

Las variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` y
`WORKER_SECRET` viven en el worker (Render), declaradas en `render.yaml`. La
service role key nunca debe llegar al cliente.

---

## Convenciones de código

- TypeScript en modo strict. Prohibido usar `any`.

- Todas las rutas de API validan el input con Zod antes de tocar la DB.
- Sin exports por defecto — solo exports nombrados.
- Las queries de Supabase siempre manejan explícitamente el patrón `{ data, error }`.
- Cada nuevo endpoint necesita su test correspondiente en `/tests/api/`. Stack de testing: Vitest + mocks manuales de Supabase y del cliente HTTP del worker (sin tocar DB ni hacer requests reales).
- Los screenshots se suben a Supabase Storage (bucket `screenshots`) antes de guardar la URL en DB.

---

## Sistema de diseño y UI

- Tokens de color en `app/globals.css`: OKLCH, capa semántica (`bg`, `surface`,
  `border`, `text`, `accent`, estados). Dark/light por clase `.dark` en `<html>`
  (script anti-flash en `app/layout.tsx`). Tema por defecto: oscuro.
- Tailwind v4 sin `tailwind.config`: el tema se define con `@theme` en `globals.css`.
- Componentes reutilizables en `components/ui/` (Button, Input, Field, Badge,
  Card, Skeleton, EmptyState, Select, Tabs, StatTile, BreakdownBar,
  ThemeToggle, iconos SVG). Úsalos; no hardcodees colores ni escalas `zinc-*`.
  Los componentes específicos de runs viven en `components/runs/`
  (`StepTimeline`, `TypeChip`, `run-status`).
- El accent es verde esmeralda. `accent` y `success` comparten la familia
  verde y se distinguen por componente: los estados de prueba viven en badges
  (píldora con punto + etiqueta), el accent vive en botones llenos y enlaces.
  No uses `accent` para el texto de un estado ni `success` para acciones
  primarias.
- La configuración del runner (navegador, dispositivo) vive en columnas de
  `test_runs` (migración `0005`; `retries` fue eliminada en `0006`). El worker captura un stream de
  logs (`test_runs.logs`) y el conteo de errores JS (`test_runs.js_error_count`).
  El detalle del run muestra logs y métricas; las features de Nivel C (API &
  webhooks, Configuración, plantillas, ejecución programada, Network) aparecen
  deshabilitadas en la UI.
- **Heurística adaptativa por `test_type`** es un patrón establecido del worker:
  para ciertos tipos de prueba se descartan los selectores literales de Gemini y
  se usa lógica tolerante a idioma/maquetado que además **verifica el resultado
  por comportamiento**. Hoy cubre **los seis** `test_type`: `login`
  (`lib/adaptive-login.ts`), `busqueda` (`lib/adaptive-search.ts`), `registro`
  (`lib/adaptive-registro.ts`), `navegacion` (`lib/adaptive-navegacion.ts`),
  `formulario` (`lib/adaptive-formulario.ts`) y `ecommerce`
  (`lib/adaptive-ecommerce.ts`). Los helpers compartidos
  (`pickFirstVisible`, `readVisibleErrorText`, `detectNativeValidationBlock`,
  `isSuccessTextVisible`, `findGenericSubmit`, regex y selectores comunes) viven
  en `lib/adaptive-common.ts`. Todos se cablean en `lib/execute-test-run.ts`,
  marcan sus pasos con el prefijo `[adaptive]` y traen tests puros + de
  integración. Ver las secciones "Detección adaptativa en flujos de …". Al
  añadir un nuevo `test_type` adaptativo, sigue este mismo patrón (detectores
  puros testeables + orquestación con verificación + prefijo `[adaptive]`).

---

## Mapa de rutas

- `/` — landing pública. Debe figurar en `PUBLIC_PATHS` de
  `lib/supabase/middleware.ts`; toda ruta accesible sin login va ahí o el
  middleware la redirige a `/login`.
- `/login`, `/signup` — autenticación.
- `/dashboard` — resumen (métricas + runs recientes).
- `/dashboard/runs` — tabla de runs con filtros.
- `/dashboard/runs/new` — formulario de nuevo test run.
- `/dashboard/runs/[id]` — detalle del run en vivo.

---

## Detección adaptativa en flujos de login

Cuando `test_type === "login"`, el worker **no** ejecuta literalmente los
selectores que sugiere Gemini para los campos de credenciales, el botón de
submit ni las aserciones post-login. En su lugar usa una heurística
(`lib/playwright/adaptive-login.ts`) que tolera variaciones de idioma y
maquetado entre apps. Esto evita los falsos negativos típicos del estilo
`locator('input[placeholder="Correo electrónico"]')` o `expect(page).toHaveURL('/dashboard')`
cuando la app real está en otro idioma o redirige a otra ruta.

### Helpers

- `findEmailField(page)` — encuentra el campo de identificador (email,
  usuario o número de documento) probando en orden: `input[type=email]`,
  `autocomplete=email|username`, `name|id` con términos largos
  (`email|usuario|user|correo|login|cedula|documento|identificacion`,
  substring case-insensitive) o cortos (`cc|dni|nit|rut`, atributo exacto),
  `getByLabel`/`getByPlaceholder` con la regex de identificador (los tokens
  cortos solo con límite de palabra), y como último recurso el primer `input`
  visible no-password.
- `fillIdentifierField(page, value, timeout)` — localiza el campo con
  `findEmailField` y lo llena. Si el valor no parece email (`looksLikeEmail`
  es `false`) relaja antes la validación HTML5 del cliente: `type=text` y
  `removeAttribute("pattern")` en el input, `noValidate=true` en su `<form>`.
  Devuelve `{ relaxed }`.
- `findPasswordField(page)` — análogo: `input[type=password]`,
  `autocomplete=current-password|new-password`, `name|id` con
  `password|contrase|clave`, label/placeholder con regex.
- `findSubmitButton(page)` — `button[type=submit]`, `input[type=submit]`,
  `getByRole('button', { name: regex })` con verbos en EN/ES
  (`Ingresar|Entrar|Acceder|Iniciar (sesión)|Login|Log in|Sign in|Enviar|Continuar|Submit`),
  y como fallback cualquier `button|a|[role=button]` cuyo texto coincida.
- `verifyLoginOutcome(page, initialUrl)` — tras el submit hace polling de
  hasta 30s (cada 400ms) hasta detectar uno de estos signos: URL distinta a
  la inicial, campo de contraseña ya no visible, un mensaje de error en una
  lista ampliada de selectores (`role=alert|status`, `aria-live`,
  `[class*=toast|snackbar|notification|error|alert]`, `.invalid-feedback`,
  `input[aria-invalid="true"]`, etc.), o un bloqueo de validación HTML5
  nativa. Para este último revisa el `<form>` del campo de contraseña (con
  fallback a todos los `<form>`) cuando tiene `noValidate=false` y
  `checkValidity()=false`, y reporta el `validationMessage` del navegador
  (queda mudo en la vía adaptativa, donde ya se puso `noValidate=true`). Si
  en 30s no hay ningún signo devuelve fallo con un mensaje diagnóstico
  (credenciales inválidas, selector exótico, o redirect lento).

### Cómo se activa

En `lib/playwright/execute-test-run.ts`, sólo para `test_type === "login"`:

- `fill`: si el selector huele a campo de password (`isPasswordFillSelector`),
  se descarta el selector hardcodeado y se usa `findPasswordField`. Si huele a
  identificador (`isEmailFillSelector`, ahora una regex que cubre términos de
  documento como `cc`/`dni`/`cédula`) se usa `fillIdentifierField`, que además
  relaja la validación HTML5 nativa cuando el valor no parece un email. Si no
  huele a ninguno se ejecuta literal.
- `click`: si el selector huele a submit (`isLoginSubmitSelector`), se invoca
  `findSubmitButton` → click → `verifyLoginOutcome`. La URL real del redirect
  queda guardada en `value` del paso. Si `verifyLoginOutcome` da fallo, el
  paso falla con la razón concreta (mensaje de error visible, URL no cambió,
  etc.).
- Tras un submit adaptativo exitoso se abre una **ventana de verificación**.
  Mientras esté abierta, los `expect_visible` / `expect_text` / `expect_url`
  consecutivos se marcan automáticamente como `passed` con
  `selector = "[adaptive] verificado por comportamiento post-login"`. La
  ventana se cierra ante el primer `goto`/`click`/`fill` posterior, lo que
  devuelve el executor a comportamiento literal y preserva la validez de
  aserciones reales en flujos que hacen login + acción + verificación.

### Reporte en la UI

Los pasos resueltos por la heurística aparecen con el prefijo `[adaptive]`
en la columna `selector` del `test_step` (`[adaptive] email/usuario`,
`[adaptive] identificador (validación nativa relajada)`, `[adaptive] password`,
`[adaptive] submit`, `[adaptive] verificado por comportamiento post-login`), y
la URL real del
post-login queda en `value`. Esto deja explícito en `/dashboard/runs/[id]`
cuándo se activó la heurística y a dónde redirigió de verdad la app.

---

## Detección adaptativa en flujos de búsqueda

Cuando `test_type === "busqueda"`, el worker tampoco ejecuta literalmente los
selectores que sugiere Gemini para el campo del buscador ni el botón de envío.
Usa una heurística (`lib/adaptive-search.ts`) análoga a la de login: tolera
variaciones de idioma y maquetado, y —sobre todo— **verifica que la búsqueda
realmente ocurrió** en vez de dar por buena la mera presencia de un contenedor.

### Helpers

- `findSearchField(page)` — localiza el input del buscador probando en orden:
  `input[type=search]`, `name` con términos largos
  (`search|query|buscar|busqueda|keyword|termino`, substring) o cortos
  (`q|s`, atributo exacto / límite de palabra), `[role=searchbox]`,
  `[role=search] input`, `getByPlaceholder` con la regex de búsqueda
  (`buscar|search|¿qué buscas|…`), y como último recurso el primer `input`
  visible que no sea password/email/hidden/submit/checkbox/radio/button.
- `findSearchSubmit(page)` — `Locator | null`: prioriza el submit dentro del
  landmark `[role=search]`, luego `button[type=submit]`,
  `getByRole('button', { name: /buscar|search|go|ir/i })` e `input[type=submit]`.
  Devuelve `null` cuando no hay botón (búsqueda live o por Enter).
- `executeSearch(page, query, timeout, opts?)` — orquesta el flujo completo y
  devuelve `{ success, resultsFound, finalUrl, reason? }`. Encuentra el campo
  (re-llena solo si el valor cambió, para no re-disparar el typeahead), toma un
  **baseline** de candidatos a resultado, envía (botón si existe, si no Enter) y
  hace polling (hasta `opts.resultsTimeoutMs`, default 10s) buscando una señal
  **fuerte**: `urlSignalsSearch`, un **delta** de nodos de resultado nuevos
  respecto al baseline, o la desaparición del campo (transición de SPA). Si no
  hay ninguna señal en el budget devuelve `success: false` con un diagnóstico.

### Funciones puras (detectores)

- `urlSignalsSearch(initialUrl, finalUrl, query)` — señal fuerte de página de
  resultados: la URL cambió **y además** trae un parámetro de búsqueda conocido
  con valor (`q|query|search|s|keyword|term|k|wd`), refleja el query en la URL,
  o cae en una ruta de resultados (`/search|/buscar|/resultados|…`). Un cambio
  de URL a secas (p. ej. redirect a login) no cuenta.
- `looksLikeEmptyState(text)` — detecta estados de cero resultados
  (`sin resultados`, `no se encontraron`, `0 resultados`, `no results found`,
  …). Usa `\b` para no confundir el encabezado normal "Resultados de la
  búsqueda" ni un "no results" embebido en otra palabra.
- `isSearchFillSelector(selector)` / `isSearchSubmitSelector(selector)` /
  `looksLikeSearchSelector(selector)` — detectan si un selector de Gemini apunta
  al input o al botón del buscador. El de campo excluye selectores de
  password/email/botón; el de submit excluye el propio campo de búsqueda.

### Por qué la detección es por DELTA, no por presencia

Muchos sitios ya tienen nodos `item`/`product`/`role=list` en nav, footer o
sidebar **antes** de buscar. Confiar en su mera presencia haría que casi
cualquier test de búsqueda pasara en verde (falso positivo). Por eso
`executeSearch` exige que aparezcan nodos de resultado **nuevos** respecto al
baseline, o una señal fuerte de URL, o una transición de SPA. `resultsFound`
distingue además los resultados reales del estado de cero resultados.

### Cómo se activa

En `lib/execute-test-run.ts`, sólo para `test_type === "busqueda"`:

- `fill`: cada `fill` guarda `ctx.searchQuery = step.value` (el último valor
  llenado es el query que usará el submit). Si el selector huele a campo de
  búsqueda (`isSearchFillSelector`) se usa `findSearchField` en vez del selector
  literal, con `selector = "[adaptive] campo de búsqueda"`.
- `click`: si el selector huele a submit de búsqueda (`isSearchSubmitSelector`)
  se invoca `executeSearch(page, ctx.searchQuery, STEP_TIMEOUT_MS)`. La URL real
  queda en `value` del paso. Si `success` es `false`, el paso falla con la razón
  concreta.

A diferencia de login, **no** se abre una ventana de verificación: en búsqueda
los `expect_*` posteriores son la validación valiosa (que el resultado esperado
aparezca), así que se ejecutan literalmente.

### Reporte en la UI

Los pasos resueltos por la heurística llevan el prefijo `[adaptive]` en la
columna `selector` del `test_step` (`[adaptive] campo de búsqueda`,
`[adaptive] submit búsqueda (con resultados)`,
`[adaptive] submit búsqueda (sin resultados confirmados)`), y la URL real de la
página de resultados queda en `value`.

### Tests

`worker/test/adaptive-search.test.ts` cubre las funciones puras (detectores,
`urlSignalsSearch`, `looksLikeEmptyState`).
`worker/test/adaptive-search.integration.test.ts` lanza un Chromium real
(caché local de Playwright) contra fixtures servidas por un servidor HTTP
efímero, cubriendo los caminos frágiles: form clásico GET, estado de cero
resultados, SPA sin cambio de URL (delta), envío con Enter sin botón, el
fallback que nunca toma el password, y la trampa de falso positivo (página con
contenedores `result`/`product`/`item` preexistentes cuya búsqueda no hace nada).

---

## Detección adaptativa en flujos de navegación

Cuando `test_type === "navegacion"` el worker trata el run como un smoke test:
su `test_data` es `{}`, así que cualquier `selector`/`expect_text` que invente
Gemini es una aserción alucinada, no una expectativa real del usuario. Por eso
los clicks se hacen tolerantes y **toda** aserción se reemplaza por una
verificación de salud de la página (`lib/adaptive-navegacion.ts`).

### Helpers

- `clickAdaptive(page, selector, timeoutMs)` — intenta el selector literal; si
  falla, extrae una pista de texto **visible** del selector (`text=` o
  `:has-text(...)`, nunca de `name=`, que es un id interno) y reintenta por
  nombre accesible (`getByRole('link'|'button')`) y, como último recurso, por
  `hasText` sobre `a|button|[role=button]|[role=link]`. Si no hay pista o nada
  matchea, re-lanza el error literal.
- `verifyPageHealthy(page)` — devuelve `{ healthy, finalUrl, title, reason }`.
  Espera `domcontentloaded`, lee título y texto del `body` y marca la página
  como no saludable si el body tiene menos de 20 caracteres de texto (render
  roto/en blanco) o si parece un documento de error.

### Funciones puras (detectores)

- `looksLikeErrorPage(title, bodyText)` — detecta páginas de error (`404`,
  `500`, `403`, `not found`, `internal server error`, `forbidden`, …) usando
  `\b`, pero **solo** cuando el body tiene poco contenido (< 200 caracteres):
  si la página es sustancial, una mención de "error" es incidental y no cuenta.

### Cómo se activa

En `lib/execute-test-run.ts`, sólo para `test_type === "navegacion"`:

- `click`: siempre se enruta por `clickAdaptive` en vez del `locator(...).click`
  literal, con `selector = "[adaptive] click tolerante"`.
- `expect_visible` / `expect_text` / `expect_url`: se descarta la aserción de
  Gemini y se ejecuta `verifyPageHealthy`. Si la página no está sana el paso
  falla con la razón concreta; si está sana, el paso pasa con
  `selector = "[adaptive] navegación verificada por salud de página"` y la URL
  real queda en `value`.

### Reporte en la UI

Los pasos resueltos por la heurística llevan el prefijo `[adaptive]`
(`[adaptive] click tolerante`,
`[adaptive] navegación verificada por salud de página`), y la URL final queda
en `value`.

### Tests

`worker/test/adaptive-navegacion.test.ts` cubre la función pura
`looksLikeErrorPage` (error con poco contenido, página real que menciona
"error", home normal). `worker/test/adaptive-navegacion.integration.test.ts`
lanza Chromium contra fixtures HTTP: home sana, 404 con poco contenido (sin
falso positivo), `clickAdaptive` con selector literal válido, fallback por texto
cuando el literal no existe, y la trampa donde el valor de un `name=` coincide
como substring con el texto de un enlace real — `clickAdaptive` debe lanzar en
vez de clickear el elemento equivocado.

---

## Detección adaptativa en flujos de formulario

Cuando `test_type === "formulario"` el worker no confía en los selectores de
campo ni en el submit literal de Gemini: resuelve cada campo por su **etiqueta**
(provista por el usuario en `test_data.fields`) y **verifica que el envío
realmente surtió efecto** (`lib/adaptive-formulario.ts`).

### Helpers

- `resolveField(page, label)` — localiza un control (`input|textarea|select`)
  por etiqueta probando en orden `getByLabel`, `getByPlaceholder`,
  `[aria-label*=...]`, `name*=...` y `id*=...`. Escapa metacaracteres de regex
  para la vía label/placeholder y, por separado, sólo `"`/`\` para el selector
  CSS de atributo (una etiqueta como "Teléfono (móvil)" no debe romper la
  regex ni la coincidencia literal).
- `fillField(control, value)` — llena según el tipo: `select` →
  `selectOption` (por label, con fallback a value); `checkbox`/`radio` →
  `check`/`uncheck` según `asBoolean`; resto → `fill`.
- `fillAndSubmitForm(page, fields, timeoutMs, opts?)` — orquesta el flujo y
  devuelve `{ success, finalUrl, reason }`. Resuelve y llena cada par, exige al
  menos un campo llenado, encuentra el submit con `findGenericSubmit`, lo
  clickea y hace polling (hasta `opts.resultsTimeoutMs`, default 8s).

### Funciones puras (detectores)

- `parseFields(raw)` — parsea el `test_data.fields` del usuario en pares
  `{ label, value }`, una línea por par, cortando en el primer `:` o `=` e
  ignorando líneas vacías o sin separador.
- `asBoolean(value)` — mapea tokens (`sí`/`si`/`true`/`x`/`yes`/`on`/`1`/
  `checked` → `true`; `no`/`false`/`off`/`0`/`unchecked` → `false`; resto →
  `null`) para checkboxes/radios.
- `isFormSubmitSelector(selector)` — detecta si un selector de Gemini apunta al
  botón de envío (verbos de `SUBMIT_VERBS`), excluyendo inputs de texto y
  `input[name...]`.

### Cómo se activa

En `lib/execute-test-run.ts`, sólo para `test_type === "formulario"`:

- Los pares `label:value` se parsean con `parseFields(formFieldsRaw)` al iniciar
  el caso y se guardan en `ctx.formFields`.
- `click`: si el selector huele a submit (`isFormSubmitSelector`) se invoca
  `fillAndSubmitForm(page, ctx.formFields, …)`. La URL real queda en `value` y
  el paso lleva `selector = "[adaptive] formulario enviado y verificado"`. Si
  `success` es `false`, el paso falla con la razón concreta.

### Verificación por comportamiento

Tras enviar, `fillAndSubmitForm` falla de inmediato si aparece un error visible
(`readVisibleErrorText`) o un bloqueo de validación nativa
(`detectNativeValidationBlock`); declara éxito solo si la URL cambió, aparece un
mensaje de éxito (`isSuccessTextVisible`) o el `<form>` desapareció. Si en el
budget no hay ninguna señal, devuelve fallo: un form que "no hace nada" no se
da por bueno.

### Reporte en la UI

El paso de envío lleva el prefijo `[adaptive]`
(`[adaptive] formulario enviado y verificado`) y la URL final en `value`.

### Tests

`worker/test/adaptive-formulario.test.ts` cubre las funciones puras
(`parseFields`, `asBoolean`, `isFormSubmitSelector`).
`worker/test/adaptive-formulario.integration.test.ts` lanza Chromium contra
fixtures HTTP: resolución por label y llenado de texto/textarea/select/checkbox,
una etiqueta con paréntesis (metacaracteres de regex), un envío GET clásico que
verifica el éxito, y la trampa de falso positivo (form con
`preventDefault` que no hace nada → `success: false`).

---

## Detección adaptativa en flujos de registro

Cuando `test_type === "registro"` el worker reusa los detectores de login para
email y password, añade detección de **nombre** y **confirmar contraseña**, y
verifica el alta por comportamiento (`lib/adaptive-registro.ts`). Comparte con
login la **ventana de verificación** post-submit.

### Helpers

- `findNameField(page)` — localiza el campo de nombre por
  `autocomplete=name|given-name`, `name*=fullname|nombre|name|firstname`,
  `id*=name` (excluyendo email/password) y label/placeholder.
- `findConfirmPasswordField(page)` — estrategia primaria: si hay 2+ inputs
  `type=password`, el segundo visible es "confirmar"; secundaria, por tokens
  (`confirm`/`repeat`/`repetir`/…) en `name`, label o placeholder.
- `registerAndVerify(page, data, initialUrl, timeoutMs)` — devuelve un
  `RegisterOutcome` (alias de `LoginOutcome`). Llena los campos disponibles
  (nombre, email —relajando la validación HTML5 si el valor no parece email—,
  password y confirmación; los ausentes se omiten), envía con
  `findGenericSubmit(page, REGISTER_VERBS)` y verifica el resultado.

### Funciones puras (detectores)

- `isNameFillSelector(selector)` — detecta selectores de campo de nombre,
  excluyendo email y password.
- `isConfirmPasswordSelector(selector)` — exige que el selector huela a password
  (`password`/`contrase`/`clave`) **y** a confirmación.
- `isRegisterSubmitSelector(selector)` — `type=submit` o verbos de registro
  (`registrar`/`crear cuenta`/`sign up`/`register`/…).

### Cómo se activa

En `lib/execute-test-run.ts`, sólo para `test_type === "registro"`:

- `fill`: el orden importa — primero `isConfirmPasswordSelector`
  (`[adaptive] confirmar password`), luego `isPasswordFillSelector`
  (`[adaptive] password`), `isNameFillSelector` (`[adaptive] nombre`) e
  `isEmailFillSelector` (`[adaptive] email/usuario` o
  `[adaptive] identificador (validación nativa relajada)`).
- `click`: si el selector huele a submit de registro
  (`isRegisterSubmitSelector`) se invoca `registerAndVerify` con
  `ctx.registroData`. Tras éxito se abre la **ventana de verificación** y los
  `expect_*` consecutivos pasan con
  `selector = "[adaptive] verificado por comportamiento post-registro"`; la
  ventana se cierra ante el primer `goto`/`click`/`fill` posterior. El paso de
  submit lleva `selector = "[adaptive] submit registro"` y la URL real en
  `value`.

### Verificación por comportamiento

`registerAndVerify` hace polling (hasta 15s): éxito si la URL cambia o aparece
un mensaje de éxito; fallo inmediato ante error visible (distinguiendo el caso
de **email ya en uso**) o bloqueo de validación nativa; si no hay ninguna señal,
fallo con diagnóstico (validación silenciosa, redirect lento o submit erróneo).

### Reporte en la UI

Los pasos resueltos llevan el prefijo `[adaptive]`
(`[adaptive] nombre`, `[adaptive] confirmar password`,
`[adaptive] submit registro`,
`[adaptive] verificado por comportamiento post-registro`, además de los de
login reusados), con la URL final en `value`.

### Tests

`worker/test/adaptive-registro.test.ts` cubre las funciones puras
(`isNameFillSelector`, `isConfirmPasswordSelector`, `isRegisterSubmitSelector`).
`worker/test/adaptive-registro.integration.test.ts` lanza Chromium contra
fixtures HTTP: detección de nombre y del segundo password como confirmación, un
registro exitoso (éxito por cambio de URL), y la trampa donde el alta siempre
muestra "email ya en uso" y no navega → `success: false` con el error real.

---

## Detección adaptativa en flujos de e-commerce

Cuando `test_type === "ecommerce"` el worker orquesta un flujo de compra por
etapas —agregar al carrito, ir al checkout, llenar el pago, confirmar la
orden— tolerando idioma/maquetado y **declarando éxito SOLO cuando se detecta
la confirmación de la orden** (`lib/adaptive-ecommerce.ts`).

### Helpers

- `findAddToCart(page)` / `addToCartStage(page, timeoutMs)` — encuentra y
  clickea el botón de agregar al carrito (acepta diálogos nativos del tipo
  `alert("Producto agregado")`).
- `goToCheckoutStage(page, timeoutMs)` — navega al carrito/checkout por
  rol/texto o por `href*=cart|checkout`.
- `fillPaymentStage(page, data, timeoutMs)` — llena email (si lo pide el
  checkout), tarjeta, expiración (campo único vía `splitExpiry` o mes/año
  separados) y CVC, resolviendo cada campo por `name`/`autocomplete`/`id`/label/
  placeholder; los campos ausentes se omiten.
- `confirmOrderAndVerify(page, timeoutMs)` — clickea el botón de
  confirmar/pagar y hace polling (hasta 8s) buscando un mensaje de éxito;
  devuelve `{ success, finalUrl, reason }`.

### Funciones puras (detectores)

- `isAddToCartSelector` / `isCheckoutNavSelector` / `isConfirmOrderSelector` /
  `isPaymentFieldSelector` — clasifican el selector de Gemini por etapa.
- `splitExpiry(expiry)` — parte `MM/AA` o `MM/AAAA` en `{ month, year }`
  (rellena el mes a dos dígitos); devuelve vacíos si no parsea.

### Cómo se activa

En `lib/execute-test-run.ts`, sólo para `test_type === "ecommerce"`:

- `click`: el **orden de comprobación importa** porque las regex se solapan
  (`comprar` matchea varias); se evalúa **confirmar > add-to-cart > checkout**
  para no tratar el botón final de pago como un add-to-cart.
  `isConfirmOrderSelector` → `confirmOrderAndVerify`
  (`[adaptive] confirmar orden`); `isAddToCartSelector` → `addToCartStage`
  (`[adaptive] agregar al carrito`); `isCheckoutNavSelector` →
  `goToCheckoutStage` (`[adaptive] ir a checkout`).
- `fill`: si el selector huele a campo de pago (`isPaymentFieldSelector`) se
  invoca `fillPaymentStage` con `ctx.ecommerceData`
  (`[adaptive] datos de pago`).

### Verificación por comportamiento y límites conocidos

El único árbitro de éxito es la **confirmación de la orden**
(`confirmOrderAndVerify` con `isSuccessTextVisible`); las etapas previas solo
fallan si no encuentran su botón/destino. Límites: las **pasarelas de pago en
iframe** quedan **fuera de alcance** (no se puede escribir dentro del iframe ni
leer su confirmación); el modelo de datos de pago es **email + tarjeta +
expiración + cvc** (`EcommerceData`), sin soporte para titular ni dirección.

### Reporte en la UI

Los pasos llevan el prefijo `[adaptive]` (`[adaptive] agregar al carrito`,
`[adaptive] ir a checkout`, `[adaptive] datos de pago`,
`[adaptive] confirmar orden`), con la URL final en `value`.

### Tests

`worker/test/adaptive-ecommerce.test.ts` cubre las funciones puras (los cuatro
detectores y `splitExpiry`). `worker/test/adaptive-ecommerce.integration.test.ts`
lanza Chromium contra fixtures HTTP: el flujo completo carrito → checkout →
pago → confirmación verde en una SPA mínima, la resolución de campos de pago por
`id` + `<label for>` (estilo demoblaze, sin name/placeholder), y la trampa de
falso positivo (botón comprar que no produce ninguna confirmación →
`success: false`).

---

## Reporte en tiempo real — reconciliación

`/dashboard/runs/[id]` muestra el avance en vivo combinando dos mecanismos.
El componente cliente `app/dashboard/runs/[id]/_components/test-run-detail.tsx`
es el único responsable de mantener el estado sincronizado.

### El problema que resuelve

Supabase Realtime (`postgres_changes`) **solo entrega eventos a partir del
momento en que el canal llega a estado `SUBSCRIBED`** — no reproduce historial.
Los datos iniciales se leen en el servidor (`page.tsx`), pero la suscripción se
establece después, en el cliente, dentro de un `useEffect`. Todo `INSERT`/
`UPDATE` ocurrido en ese hueco (típicamente 1–3 s: hidratación + handshake del
WebSocket) se pierde de forma permanente. Como el worker inserta los
`test_cases` y `test_steps` en una ráfaga apenas responde Gemini, esa ráfaga
suele caer dentro del hueco.

Agrava el problema que la suscripción a `test_steps` **no puede filtrarse en el
servidor** (`test_steps` no tiene columna `test_run_id`): filtra en el cliente
contra `caseIdsRef`, un `Set` que se llena solo con los `test_cases` iniciales
y los eventos Realtime de `test_cases`. Si esos eventos se pierden en el hueco,
`caseIdsRef` queda vacío y **todos** los eventos posteriores de `test_steps` se
descartan — la lista de pasos nunca se puebla hasta recargar la página.

### Cómo se reconcilia

La función `refetch()` relee el estado autoritativo desde la DB con el cliente
del navegador (`test_runs` + `test_cases` + `test_steps`), reemplaza el estado
y **repuebla `caseIdsRef`**. Se dispara:

- Al montar (diferida un tick para no encadenar renders dentro del efecto) —
  cierra el hueco de la suscripción.
- En cada cambio de `run.status`, incluida la transición a un estado final —
  garantiza captar el estado definitivo del run.
- Cada 3 s mientras el run sigue activo (`pendiente`/`corriendo`) — respaldo
  ante caídas del WebSocket; el `setInterval` se limpia al terminar el run.

Realtime se mantiene como vía rápida (updates instantáneos paso a paso); el
`refetch()` es la garantía de correctitud. La migración `0004_realtime.sql`
debe haber añadido las tres tablas a la publication `supabase_realtime`.

---

## Roadmap del proyecto

### Fase 1 — Base del proyecto
Configuración inicial del entorno, autenticación y estructura de la base de datos.
El objetivo de esta fase es tener el proyecto corriendo localmente con login funcional
y la estructura de tablas lista en Supabase.

- [x] Crear proyecto Next.js 14 con TypeScript y Tailwind
- [x] Configurar Supabase: tablas, relaciones y políticas RLS
- [x] Implementar autenticación con Supabase Auth (registro, login, logout)
- [x] Crear layout base del dashboard (protegido por auth)
- [x] Configurar variables de entorno para todos los servicios
- [x] Configurar ESLint, Prettier y TypeScript en modo strict

### Fase 2 — Integración con IA
Conectar el formulario del usuario con la API de Gemini.
El objetivo es que el sistema reciba un prompt en lenguaje natural y devuelva
un JSON válido con los casos de prueba estructurados.

- [x] Crear formulario: campo URL + campo prompt en lenguaje natural
- [x] Instalar y configurar @google/genai en el worker (modelo `gemini-2.5-flash`)
- [x] Diseñar el prompt de sistema (systemInstruction) que instruye a Gemini a devolver JSON estructurado, usando `responseMimeType: "application/json"`
- [x] Crear endpoint POST /api/test-runs (validado con Zod, guarda en DB con status "pendiente")
- [x] Implementar llamada a Gemini desde el worker y parsear la respuesta
- [x] Validar que el JSON devuelto cumple el contrato de tipos esperado
- [x] Manejar errores: respuesta malformada, timeout, límite de tokens, rate limit (429)

### Fase 3 — Motor de ejecución con Playwright
Ejecutar los casos de prueba generados por la IA en un browser real.
El objetivo es que cada paso del JSON se ejecute, se capture su resultado
y se suba el screenshot a Supabase Storage.

- [x] Instalar Playwright y configurar Chromium headless en el worker
- [x] Implementar el runner: iterar los pasos del JSON y ejecutar cada acción
- [x] Soportar acciones: goto, click, fill, expect (visible, text, url)
- [x] Capturar screenshot después de cada paso y subir a Supabase Storage
- [x] Registrar resultado por paso (passed/failed) y mensaje de error si aplica
- [x] Actualizar estado del test_run en Supabase al terminar (completed/failed)
- [x] Implementar timeout por job (máximo 120s) para evitar procesos colgados

### Fase 4 — Worker HTTP asíncrono
Desacoplar la ejecución de Playwright del ciclo request-response de Vercel.
La API Route inserta el `test_run` y delega vía HTTP a un worker Express en
Render; el frontend recibe `201` al instante y suscribe al run por Realtime.

- [x] Crear el cliente HTTP `triggerWorkerRun` que llama al worker con `Bearer WORKER_SECRET`
- [x] Modificar POST /api/test-runs para insertar el run y disparar al worker en `after()`
- [x] Construir el worker Express con `POST /run-test` y `GET /health`
- [x] Cola en memoria de concurrencia 1 (Render free tier, 512 MB de RAM)
- [x] Barrido de runs huérfanos al arrancar (limpia los runs pendientes/corriendo viejos)
- [x] Registrar logs de cada job (inicio, fin, error) en la tabla test_runs

### Fase 5 — Reporte en tiempo real
Mostrar el progreso y resultado de la ejecución en el dashboard sin recargar la página.
El objetivo es que el usuario vea cada paso completarse en vivo mientras Playwright trabaja.

- [x] Configurar suscripción a Supabase Realtime en el frontend
- [x] Crear vista de reporte: lista de test_cases con sus test_steps
- [x] Mostrar estado en vivo por paso (pendiente / corriendo / passed / failed)
- [x] Mostrar screenshot de cada paso al hacer click
- [x] Mostrar duración total del test_run al completarse
- [x] Crear vista de historial: todos los test_runs del usuario ordenados por fecha

### Fase 6 — Despliegue y producción
Llevar el proyecto a producción con los dos servicios desplegados y funcionando.
El objetivo es tener una URL pública funcional lista para el portafolio.

- [ ] Desplegar frontend en Vercel con variables de entorno de producción
- [ ] Desplegar worker en Render con `render.yaml` y variables de producción
- [ ] Verificar `GET {WORKER_URL}/health` y un run end-to-end desde Vercel
- [ ] Verificar que RLS de Supabase funciona correctamente en producción
- [ ] Escribir README.md del proyecto con GIF demo del flujo completo
- [ ] Agregar el proyecto al portafolio con descripción técnica del stack

---

## Lo que NO se debe hacer — Reglas de seguridad

### Exposición de claves y credenciales

- **Nunca** poner `GEMINI_API_KEY` en ningún archivo del lado del cliente.
  Aunque el tier gratuito de Gemini no cobra, una clave expuesta puede ser usada
  por terceros para agotar la cuota diaria del proyecto o ser revocada por Google
  por uso abusivo. La clave vive solo en el worker, nunca con prefijo `NEXT_PUBLIC_`.
- **Nunca** poner `SUPABASE_SERVICE_ROLE_KEY` en el frontend ni en rutas de API
  accesibles públicamente. Esta clave bypasea todas las políticas RLS de Supabase,
  lo que significa acceso total a todos los datos de todos los usuarios.
- **Nunca** commitear archivos `.env` al repositorio. Agregar `.env*` al `.gitignore`
  desde el primer commit. Si una clave se sube a GitHub aunque sea por un segundo,
  debe considerarse comprometida y regenerarse inmediatamente.
- Las variables que empiezan con `NEXT_PUBLIC_` en Next.js son visibles en el browser.
  Solo pueden llevar esa nomenclatura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Ninguna otra variable sensible puede tener ese prefijo.

### Validación de inputs del usuario

- **Nunca** usar directamente en Playwright un selector que venga del input del usuario
  sin validarlo primero con Zod. Un usuario malicioso podría inyectar un selector
  que ejecute acciones no deseadas en el browser del servidor.
- **Nunca** usar directamente como URL el valor que envía el usuario sin validar
  que sea una URL bien formada y que el esquema sea `http` o `https`.
  Evitar esquemas como `file://`, `javascript:` o `data:` que podrían
  acceder al sistema de archivos del servidor o ejecutar código arbitrario.
- Toda entrada del usuario que llegue a una ruta de API debe pasar por un schema
  de Zod antes de cualquier otra operación. Si la validación falla, responder
  con status 400 y no continuar.
- **Protección SSRF (defensa en profundidad).** Validar el esquema no basta: el
  worker navega con un navegador real y sube screenshots, así que un destino
  interno permitiría exfiltrar contenido. La protección vive en tres capas:
  1. **API (Zod)** — `lib/validation/test-run.ts` rechaza `target_url` cuyo host
     sea interno por forma literal (`localhost`, IPs privadas/loopback/link-local
     y encodings) vía `isBlockedLiteralHost` (`lib/validation/safe-host.ts`).
     Filtro síncrono de UX; no resuelve DNS.
  2. **Worker pre-navegación** — `assertSafeUrl` (`worker/lib/safe-url.ts`)
     resuelve DNS y bloquea si el host resuelve a una IP interna, antes de cada
     `goto`.
  3. **Worker interceptor** — `installSsrfGuard` registra `context.route("**/*")`
     y valida **cada request** (la frontera real: cubre redirects, DNS rebinding
     y sub-recursos). Aplicado al crear el contexto en `execute-test-run.ts`.
  El núcleo de clasificación de IP/host está **duplicado** en
  `worker/lib/safe-url.ts` y `lib/validation/safe-host.ts` porque Render
  despliega el worker con `rootDir: worker` (no puede importar fuera de
  `worker/`); ambas copias son puras (sin node builtins, seguras para el bundle
  del cliente) y tienen tests. El flag `SSRF_ALLOW_PRIVATE_NETWORK=1` desactiva
  el guard y **solo** debe usarse en test/dev (los integration tests lo setean
  para navegar a `127.0.0.1`); en Render se deja sin definir.

### Ejecución de Playwright en el servidor

- **Nunca** ejecutar Playwright directamente desde una ruta de API de Next.js.
  Playwright corre en el worker de Render; la API Route delega vía
  `POST /run-test` autenticado con `Bearer WORKER_SECRET`. Esto evita
  timeouts de Vercel y, más importante, contiene el blast radius: aunque
  alguien sature la API, los Chromium se serializan en el worker
  (concurrencia 1) sin tumbar Vercel.
- Implementar un límite de rate por usuario en el endpoint POST /api/test-runs.
  Un usuario no debe poder encolar más de 5 jobs por minuto. Implementado en
  `app/api/test-runs/route.ts` contando filas recientes en `test_runs` por
  `user_id` dentro de una ventana de 60s; al sobrepasar devuelve `429` con
  header `Retry-After: 60`.
- El worker de Playwright debe correr con permisos mínimos del sistema operativo.
  No debe tener acceso de escritura fuera del directorio temporal de screenshots.

### Rutas de API y autenticación

- **Nunca** confiar en el `user_id` que viene en el body de una request.
  Siempre leer el usuario autenticado desde la sesión de Supabase en el servidor.
  Un atacante podría enviar cualquier `user_id` en el body para acceder a datos ajenos.
- Todas las rutas de API que lean o escriban datos deben verificar que el usuario
  tiene sesión activa antes de ejecutar cualquier query.
- Las políticas RLS en Supabase son la última línea de defensa, no la única.
  La lógica de autorización debe existir también en el backend.