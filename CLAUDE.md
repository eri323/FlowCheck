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
worker/            → Proceso Node.js independiente — consumidor de BullMQ
```

Monorepo. El frontend y las rutas de API viven en Next.js.
El worker de Playwright es un proceso separado porque necesita correr jobs largos
(30–60s) sin bloquear las requests HTTP.

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
| Cola de jobs   | BullMQ + Upstash Redis  |
| Deploy front   | Vercel                  |
| Deploy worker  | Railway                 |
| Lenguaje       | TypeScript en todo      |

---

## Comandos principales

```bash
npm run dev          # Inicia servidor de desarrollo Next.js (puerto 3000)
npm run worker       # Inicia proceso worker BullMQ
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
- `test_runs` — un registro por ejecución (status, created_at, user_id)
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

# Redis (Upstash)
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

---

## Convenciones de código

- TypeScript en modo strict. Prohibido usar `any`.

- Todas las rutas de API validan el input con Zod antes de tocar la DB.
- Sin exports por defecto — solo exports nombrados.
- Las queries de Supabase siempre manejan explícitamente el patrón `{ data, error }`.
- Cada nuevo endpoint necesita su test correspondiente en `/tests/api/`. Stack de testing: Vitest + mocks manuales de Supabase y BullMQ (sin tocar Redis ni DB reales).
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

### Fase 4 — Cola de jobs asíncrona
Desacoplar la ejecución de Playwright del ciclo request-response de HTTP.
El objetivo es que el usuario no espere bloqueado y el worker procese los jobs
de forma independiente y resiliente.

- [x] Instalar BullMQ y conectar con Upstash Redis
- [x] Modificar POST /api/test-runs para encolar el job en lugar de ejecutar directo
- [x] Crear el proceso worker que consume la cola y ejecuta Playwright
- [x] Implementar reintentos automáticos (máximo 2 reintentos por job fallido)
- [x] Configurar concurrencia: máximo 3 jobs simultáneos por instancia del worker
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
- [ ] Desplegar worker en Railway con variables de entorno de producción
- [ ] Configurar Upstash Redis en producción
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

### Ejecución de Playwright en el servidor

- **Nunca** ejecutar Playwright directamente desde una ruta de API de Next.js.
  Siempre pasar por la cola de BullMQ. Además del problema de timeout,
  un atacante que sature el endpoint podría lanzar cientos de browsers simultáneos
  y derribar el servidor.
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