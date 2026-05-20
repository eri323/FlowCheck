# FlowCheck — Visión integral del proyecto

Este documento es la **fuente única de verdad** para entender qué hace el
proyecto, cómo está construido y por qué cada decisión está donde está.
Si solo tienes tiempo de leer un archivo, lee este.

> Documentos complementarios:
> - `README.md` — versión corta para visitantes del repo.
> - `CLAUDE.md` — instrucciones de agente y convenciones internas (incluye
>   `AGENTS.md` por referencia).
> - `docs/DEPLOY.md` — guía paso a paso para desplegar a producción.

---

## 1. Qué es FlowCheck

Plataforma web donde un usuario:

1. Pega la **URL** de su aplicación.
2. Describe en **lenguaje natural** un flujo a probar
   (ej. _"entra con `admin@demo.com / 1234`, ve a *Mis pedidos* y verifica que aparezcan 3 items"_).
3. La IA traduce esa descripción a casos de prueba estructurados.
4. Un worker los ejecuta en **Chromium real** vía Playwright.
5. El dashboard muestra el resultado **paso a paso en vivo**, con un
   screenshot por cada acción.

Equivalente comercial: Testim.io, Mabl, Reflect.run — pero construido desde
cero como proyecto de portafolio.

---

## 2. Stack

| Capa            | Tecnología                                          |
|-----------------|-----------------------------------------------------|
| Frontend        | Next.js 16 (App Router) + Tailwind 4 + TypeScript strict |
| API             | API Routes de Next.js (mismo repo, `/app/api/`)     |
| Auth + DB       | Supabase (Postgres + Row Level Security)            |
| Tiempo real     | Supabase Realtime (WebSocket)                       |
| Archivos        | Supabase Storage (bucket `screenshots`)             |
| IA              | `@google/genai` — `gemini-2.5-flash` con `responseMimeType: application/json` |
| Browser tests   | Playwright Chromium (`@sparticuz/chromium`)         |
| Worker          | Express HTTP — proceso de larga duración            |
| Validación      | Zod en cada entrada del usuario                     |
| Tests           | Vitest + mocks manuales (sin DB ni red reales)      |
| Deploy frontend | Vercel                                              |
| Deploy worker   | Render free tier (definido en `render.yaml`)        |

Restricciones importantes:

- **TypeScript en modo `strict`**. Prohibido `any`.
- Solo **exports nombrados**, sin `export default`.
- Todo `{ data, error }` de Supabase se maneja explícitamente.

---

## 3. Arquitectura

```
┌──────────────┐    POST /api/test-runs    ┌────────────┐
│  Next.js UI  │ ────────────────────────▶ │  API Route │
│  (Vercel)    │                           │  (Vercel)  │
└──────┬───────┘                           └─────┬──────┘
       │ Supabase Realtime                       │ after() → POST /run-test
       │ (test_runs, test_cases, test_steps)     │ (Bearer WORKER_SECRET)
       │                                         ▼
       │                                  ┌────────────┐
       │                                  │   Worker   │
       │                                  │   Express  │
       │                                  │  (Render)  │
       │                                  └─────┬──────┘
       │                            Gemini ────▶│
       │                            Playwright ▶│
       │                            Storage ───▶│
       └───────────── Supabase (DB) ◀───────────┘
```

**¿Por qué dos servicios y no uno?**

Cada test run dura entre 30 y 60 segundos: muy por encima del límite de
ejecución de las Vercel Functions y demasiado intensivo en memoria (un
Chromium completo) para serverless. La API Route inserta el `test_run`,
delega el trabajo al worker por HTTP y responde `201` al instante. El
frontend sigue el progreso por Realtime; el worker hace el trabajo pesado en
Render. Render free puede dormir tras 15 min de inactividad — el primer
request lo despierta (~30–50 s).

---

## 4. Modelo de datos

Cinco tablas en Supabase, todas con **Row Level Security activado**:

| Tabla         | Campos clave                                                                                                    | Notas                                                                                  |
|---------------|-----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `profiles`    | `id` (= `auth.users.id`), `plan`, `rol`                                                                          | Una fila por usuario; creada por trigger al registrarse.                               |
| `projects`    | `id`, `user_id`, `name`, `target_url`                                                                            | Agrupador opcional de runs (un usuario tiene N proyectos).                             |
| `test_runs`   | `id`, `user_id`, `status`, `prompt`, `target_url`, `test_type`, `browser`, `device`, `logs`, `js_error_count`    | Una fila por ejecución. `status ∈ {pendiente, corriendo, exitoso, fallido, cancelado}`. |
| `test_cases`  | `id`, `test_run_id`, `title`, `status`                                                                           | Generados por Gemini; agrupan pasos relacionados.                                      |
| `test_steps`  | `id`, `test_case_id`, `action`, `selector`, `value`, `status`, `screenshot_url`, `error_message`                  | Una fila por acción ejecutada por Playwright.                                          |

Migraciones (en orden, `supabase/migrations/`):

- `0001_init.sql` — tablas y RLS base.
- `0002_test_types.sql` — columna `test_type` y catálogo.
- `0003_grants.sql` — permisos al rol `anon` y `authenticated`.
- `0004_realtime.sql` — añade las tres tablas a la publication `supabase_realtime`.
- `0005_runner_config.sql` — columnas `browser`, `device`, `logs`, `js_error_count`.
- `0006_drop_retries.sql` — elimina `retries` (no se reintenta a nivel job).

`test_steps` **no tiene** columna `test_run_id`: se enlaza al run por `test_case_id`. Detalle relevante para la reconciliación Realtime (sección 8).

---

## 5. Ciclo de vida de un test run

```
1. UI: usuario envía formulario → POST /api/test-runs
2. API Route:
   - Verifica sesión Supabase (usa user_id de la sesión, NUNCA del body)
   - Valida payload con Zod
   - Aplica rate limit (5 runs / 60 s / user_id)
   - INSERT test_runs status='pendiente'
   - after(): fetch POST {WORKER_URL}/run-test
                Authorization: Bearer {WORKER_SECRET}
   - Responde 201 al cliente
3. Worker (Express, cola en memoria, concurrencia 1):
   - Valida Bearer secret
   - Encola; cuando es su turno:
     - UPDATE status='corriendo'
     - Llama a Gemini → recibe JSON con test_cases + test_steps
     - Valida JSON contra contrato Zod estricto
     - INSERT test_cases + test_steps (status='pendiente')
     - Lanza Chromium (@sparticuz/chromium)
     - Por cada step: ejecuta acción → captura screenshot → upload
       a Supabase Storage → UPDATE step (status, screenshot_url)
     - Cierra Chromium
     - UPDATE test_run status='exitoso' | 'fallido'
4. UI (cliente):
   - Suscripción a Supabase Realtime (postgres_changes)
   - refetch() periódico cada 3 s mientras el run sigue activo
   - Render del timeline paso a paso
```

Timeout duro: **120 s por job** dentro del worker para evitar Chromium
zombi. La API Route también tiene `after()` con timeout de 55 s para tolerar
el cold start de Render.

---

## 6. Estructura del repo

```
ai-testing-platform/
├── app/                         Next.js 16 App Router
│   ├── _components/             Componentes privados de la app
│   │   ├── auth/                AuthLayout
│   │   └── landing/             Hero, HowItWorks, TestTypes, Features, CTA, Nav, Footer
│   ├── api/test-runs/           POST: crea run + dispara worker
│   ├── auth/{callback,logout}/  Rutas de sesión
│   ├── dashboard/               Vistas protegidas
│   │   ├── _components/         Shell, Sidebar, Topbar, UserMenu, PageHeader
│   │   └── runs/                Listado + detalle + form de creación
│   ├── login/  signup/          Páginas + server actions
│   ├── globals.css              Tokens OKLCH + tema Tailwind v4 (@theme)
│   ├── icon.svg                 Favicon — Next 16 lo registra automáticamente
│   ├── layout.tsx               Root layout + script anti-flash de tema
│   └── page.tsx                 Landing pública
├── components/
│   ├── runs/                    StepTimeline, TypeChip, RunStatus (badges/píldoras)
│   └── ui/                      Sistema de diseño compartido
├── lib/
│   ├── cn.ts                    classnames helper
│   ├── format.ts                fecha, duración, números
│   ├── supabase/                client / server / admin / middleware
│   ├── validation/              schemas Zod (auth, test-run)
│   └── worker/                  triggerWorkerRun — fetch con Bearer
├── worker/                      Paquete npm independiente (deploy en Render)
│   ├── server.ts                Express: POST /run-test, GET /health
│   ├── process-test-run.ts      Orquestador: Gemini → Playwright → DB
│   ├── concurrency.ts           Cola FIFO en memoria, concurrencia 1
│   ├── sweep-orphan-runs.ts     Limpia runs viejos en pendiente/corriendo al arrancar
│   ├── lib/
│   │   ├── gemini.ts            Llamada a @google/genai + parse JSON
│   │   ├── test-plan.ts         Contrato Zod del JSON que devuelve Gemini
│   │   ├── execute-test-run.ts  Loop de pasos sobre Playwright
│   │   ├── adaptive-login.ts    Heurística de login (sección 9)
│   │   ├── chromium-launch.ts   Wrapper @sparticuz/chromium
│   │   ├── upload-screenshot.ts Upload a Supabase Storage
│   │   ├── safe-url.ts          Filtro de URLs (http/https only)
│   │   ├── supabase-admin.ts    Cliente service_role del worker
│   │   └── types.ts             Tipos compartidos del worker
│   ├── test/                    Vitest del worker
│   ├── package.json             Deps del worker (Express, Playwright, Gemini)
│   ├── tsconfig.json            Compilación aislada del worker
│   └── vitest.config.ts
├── tests/                       Vitest del lado Next (API + lib)
│   ├── api/test-runs.test.ts
│   └── lib/{trigger-worker,validation/test-run}.test.ts
├── supabase/migrations/         0001 → 0006
├── docs/
│   ├── DEPLOY.md                Guía de despliegue paso a paso
│   ├── OVERVIEW.md              Este documento
│   └── superpowers/             Planes y specs de cambios (histórico)
├── public/                      Estáticos (vacío salvo lo que se añada)
├── proxy.ts                     Convención Next 16 (renombrado desde middleware.ts)
├── render.yaml                  Blueprint de Render para el worker
├── vercel.json                  Config de Vercel (region iad1)
├── .vercelignore                Excluye /worker del bundle de Vercel
├── .env.example                 Variables del lado Next (cliente + API Route)
├── worker/.env.example          Variables del lado worker (Render)
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json                tsconfig raíz, excluye worker/
├── vitest.config.ts
├── README.md
├── CLAUDE.md
└── AGENTS.md
```

---

## 7. Variables de entorno

### Lado Next (Vercel) — `.env.local` / Vercel project settings

| Variable                          | Notas                                                            |
|-----------------------------------|------------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | URL pública del proyecto Supabase.                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Clave pública anon.                                              |
| `SUPABASE_SERVICE_ROLE_KEY`       | Solo en server/API Routes. **Nunca** con prefijo `NEXT_PUBLIC_`. |
| `WORKER_URL`                      | URL del worker en Render.                                        |
| `WORKER_SECRET`                   | Mismo valor que en Render. ≥ 32 chars aleatorios.                |

### Lado worker (Render) — `worker/.env.example` / Render env

| Variable                     | Notas                                            |
|------------------------------|--------------------------------------------------|
| `SUPABASE_URL`               | Misma URL que arriba (sin `NEXT_PUBLIC_`).       |
| `SUPABASE_SERVICE_ROLE_KEY`  | service_role; bypasea RLS, nunca llega al front. |
| `GEMINI_API_KEY`             | Solo en Render. Nunca en Vercel.                 |
| `WORKER_SECRET`              | Mismo valor que en Vercel.                       |
| `PORT`                       | Lo inyecta Render (3001 en local).               |

---

## 8. Reporte en tiempo real — reconciliación

`/dashboard/runs/[id]` combina dos mecanismos para mostrar el avance en vivo:

1. **Supabase Realtime** (`postgres_changes`) — vía rápida, eventos `INSERT` /
   `UPDATE` en cuanto ocurren.
2. **`refetch()`** — relee el estado autoritativo desde la DB. Garantía de
   correctitud.

### Por qué no basta con Realtime

Realtime **solo entrega eventos a partir del momento en que el canal está
`SUBSCRIBED`** — no reproduce historial. Los datos iniciales se leen en el
server (`page.tsx`), pero la suscripción se establece en el cliente dentro
de un `useEffect`. Los `INSERT` que ocurran entre ambos momentos (1–3 s) se
pierden para siempre. Como el worker inserta `test_cases` y `test_steps` en
una sola ráfaga al recibir la respuesta de Gemini, esa ráfaga suele caer
dentro del hueco.

Agrava el problema que la suscripción a `test_steps` **no puede filtrarse en
servidor** (la tabla no tiene `test_run_id`): el cliente filtra contra un
`Set` `caseIdsRef` poblado con los `test_cases` iniciales más los eventos
Realtime. Si esos eventos se pierden, el `Set` queda vacío y **todos** los
eventos posteriores de `test_steps` se descartan.

### Cómo se reconcilia

`refetch()` relee `test_runs` + `test_cases` + `test_steps`, reemplaza el
estado y repuebla `caseIdsRef`. Se dispara:

- Al montar (diferido un tick) — cierra el hueco de suscripción.
- En cada cambio de `run.status` — captura el estado definitivo.
- Cada 3 s mientras el run está activo — respaldo ante caídas del WebSocket.
  El `setInterval` se limpia al terminar.

Único responsable de la sincronía: `app/dashboard/runs/[id]/_components/test-run-detail.tsx`.

---

## 9. Detección adaptativa en flujos de login

Cuando `test_type === "login"`, el worker **no** ejecuta literalmente los
selectores que sugiere Gemini para email / password / submit ni las
aserciones post-login. En su lugar usa una heurística
(`worker/lib/adaptive-login.ts`) que tolera variaciones de idioma y maquetado
entre apps.

### Helpers

- **`findEmailField(page)`** — busca campo de identificador (email, usuario,
  documento) por: `input[type=email]`, `autocomplete=email|username`,
  `name|id` con términos largos (`email|usuario|user|correo|login|cedula|documento|identificacion`) o
  cortos (`cc|dni|nit|rut`), `getByLabel` / `getByPlaceholder` con regex de
  identificador, y como fallback el primer input visible no-password.
- **`fillIdentifierField(page, value)`** — usa `findEmailField` y lo llena.
  Si el valor no parece email, relaja la validación HTML5: `type=text`,
  `removeAttribute("pattern")`, `<form>.noValidate=true`.
- **`findPasswordField(page)`** — análogo: `input[type=password]`,
  `autocomplete=current-password|new-password`, `name|id` con
  `password|contrase|clave`.
- **`findSubmitButton(page)`** — `button[type=submit]`, `input[type=submit]`,
  `getByRole('button', { name })` con verbos EN/ES
  (`Ingresar|Entrar|Acceder|Iniciar (sesión)|Login|Log in|Sign in|Enviar|Continuar|Submit`).
- **`verifyLoginOutcome(page, initialUrl)`** — tras el submit hace polling
  de hasta 30 s buscando uno de estos signos: URL cambió, campo de password
  ya no visible, mensaje de error en un set amplio de selectores
  (`role=alert|status`, `aria-live`, `[class*=toast|snackbar|notification|error|alert]`,
  `.invalid-feedback`, `input[aria-invalid="true"]`), o validación HTML5
  nativa bloqueando. Devuelve éxito o un mensaje diagnóstico.

### Cómo se activa

En `worker/lib/execute-test-run.ts`, solo para `test_type === "login"`:

- `fill` con selector que huele a password → `findPasswordField`.
- `fill` con selector que huele a identificador → `fillIdentifierField`.
- `click` con selector que huele a submit → `findSubmitButton` → click →
  `verifyLoginOutcome`. La URL real del redirect se guarda en `value`.
- Tras un submit adaptativo exitoso se abre una **ventana de verificación**:
  los `expect_visible` / `expect_text` / `expect_url` consecutivos se marcan
  automáticamente como `passed` con
  `selector = "[adaptive] verificado por comportamiento post-login"`. La
  ventana se cierra ante el primer `goto`/`click`/`fill` posterior — eso
  preserva la validez de aserciones reales en flujos que hacen login +
  acción + verificación.

Los pasos resueltos por la heurística aparecen con prefijo `[adaptive]` en
la columna `selector` del `test_step`, así queda explícito en el reporte
cuándo se activó y a dónde redirigió de verdad la app.

---

## 10. Seguridad

Reglas duras del proyecto:

- **Variables sensibles**: `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY`
  **nunca** llevan prefijo `NEXT_PUBLIC_`. Solo `NEXT_PUBLIC_SUPABASE_URL`
  y `NEXT_PUBLIC_SUPABASE_ANON_KEY` son legítimas con ese prefijo.
- **`.env*` en `.gitignore`** desde el primer commit (`.env.example`
  whitelisted). Si una clave llega a GitHub aunque sea 1 segundo, se rota.
- **Toda entrada del usuario pasa por Zod** antes de tocar la DB.
- **URLs del usuario** se filtran con `safe-url.ts` — solo `http` / `https`.
  Esquemas `file://`, `javascript:`, `data:` quedan bloqueados.
- **Selectores del usuario nunca van directos a Playwright** sin pasar por
  el contrato Zod del plan de testing.
- **`user_id` se lee de la sesión Supabase, nunca del body**. RLS es la
  última línea de defensa, no la única.
- **Playwright nunca corre dentro de una API Route**. Vive en el worker
  HTTP autenticado con `Bearer WORKER_SECRET`. Si alguien satura la API,
  los Chromium se serializan en el worker (concurrencia 1) sin tumbar
  Vercel.
- **Rate limit**: 5 runs / minuto / `user_id` en `POST /api/test-runs`.
  Implementado contando filas recientes en `test_runs`; devuelve `429` con
  `Retry-After: 60`.

---

## 11. Convenciones de UI

- **Tokens de color OKLCH** en `app/globals.css` con capa semántica:
  `bg`, `surface`, `border`, `text`, `accent`, estados (`success`,
  `warning`, `danger`). Dark / light por clase `.dark` en `<html>` con
  script anti-flash en `layout.tsx`. **Tema por defecto: oscuro.**
- **Tailwind v4 sin `tailwind.config`**: el tema se define con `@theme` en
  `globals.css`.
- **Componentes reutilizables** en `components/ui/`. Usarlos siempre, nunca
  hardcodear colores ni escalas `zinc-*`.
- **Accent vs success**: el accent es verde esmeralda; comparten familia y
  se distinguen por componente. Estados de prueba → badges (píldora con
  punto). Accent → botones llenos y enlaces. **Nunca** uses `accent` para
  texto de estado ni `success` para acciones primarias.
- **Logo**: viewfinder con corchetes y punto central (`components/ui/logo.tsx`).
  El favicon (`app/icon.svg`) es el mismo símbolo.
- **Landing**: cada sección ocupa al menos `min-h-[calc(100svh-4rem)]`
  (alto del viewport menos la nav sticky de 64 px) y su contenido se centra
  verticalmente. La línea divisoria entre secciones queda fuera de pantalla
  hasta que el usuario hace scroll a la siguiente.

---

## 12. Mapa de rutas

- `/` — landing pública. Debe estar listada en `PUBLIC_PATHS` de
  `lib/supabase/middleware.ts`, si no el middleware redirige a `/login`.
- `/login`, `/signup` — autenticación.
- `/dashboard` — resumen (métricas + runs recientes).
- `/dashboard/runs` — tabla de runs con filtros.
- `/dashboard/runs/new` — formulario de nuevo test run.
- `/dashboard/runs/[id]` — detalle del run en vivo (timeline + screenshots).
- `/api/test-runs` (POST) — crea el run y dispara al worker.
- `/auth/callback`, `/auth/logout` — flujo de sesión Supabase.

---

## 13. Setup local

```bash
git clone <repo>
cd ai-testing-platform
npm install
cp .env.example .env.local            # rellenar con tus claves reales
cd worker && npm install && cd ..      # worker es paquete aparte
```

Aplicar las migraciones de `supabase/migrations/` al proyecto Supabase
(SQL editor o `supabase db push`). Crear el bucket `screenshots` con
lectura pública.

```bash
npm run dev               # Next.js en http://localhost:3000
cd worker && npm start    # Worker Express en http://localhost:3001
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
npm test                  # Vitest del lado Next
cd worker && npm test     # Vitest del worker
```

Sin el worker corriendo, los runs quedan en `pendiente` y la API Route los
marca como `fallido` tras el timeout del fetch.

> **Importante**: en Supabase Authentication → URL Configuration debe estar
> desactivado *Confirm email* (o `http://localhost:3000` en *Site URL* y
> *Redirect URLs*), si no el login falla justo después del registro.

---

## 14. Despliegue

Resumen (detalle paso a paso en `docs/DEPLOY.md`):

| Pieza                       | Proveedor | Comando / Config            |
|-----------------------------|-----------|-----------------------------|
| Frontend + API Routes       | Vercel    | `next build`, `vercel.json` |
| Worker Express + Playwright | Render    | `render.yaml` (Node + `@sparticuz/chromium`) |
| DB + Auth + Storage         | Supabase  | Proyecto remoto, migraciones aplicadas       |

Checklist post-deploy:

- [ ] `GET {WORKER_URL}/health` responde `{"ok": true}`.
- [ ] Un usuario nuevo puede registrarse desde la URL de Vercel.
- [ ] Un run pasa de `pendiente` → `corriendo` → `exitoso`.
- [ ] Los screenshots aparecen en el bucket y se renderizan en
      `/dashboard/runs/[id]`.
- [ ] La UI del detalle del run avanza **sin recargar** (Realtime + refetch).
- [ ] Un segundo usuario no ve los runs del primero (RLS).

---

## 15. Estado del roadmap

| Fase | Descripción                            | Estado |
|------|----------------------------------------|--------|
| 1    | Base del proyecto (Next + Supabase)    | ✅      |
| 2    | Integración con Gemini                 | ✅      |
| 3    | Motor de ejecución con Playwright      | ✅      |
| 4    | Worker HTTP asíncrono (Express+Render) | ✅      |
| 5    | Reporte en tiempo real (Realtime+refetch) | ✅   |
| 6    | Despliegue a producción + README/demo  | ⏳ en curso |

Detalle granular: sección *Roadmap* de `CLAUDE.md`.

---

## 16. Para una IA que aterriza en este proyecto

Antes de tocar código:

1. Lee `AGENTS.md` — **Next 16 tiene breaking changes**. Consulta
   `node_modules/next/dist/docs/` cuando dudes.
2. Lee `CLAUDE.md` — convenciones, seguridad, detalles internos.
3. Mira `supabase/migrations/` para entender el schema actual.
4. Si tocas el worker, recordá que vive en `worker/` con su propio
   `package.json`, `tsconfig.json` y tests Vitest.
5. Si añadís un endpoint, **validás con Zod** y **agregás un test** en
   `tests/api/`. Stack de testing: Vitest + mocks manuales de Supabase y
   del cliente HTTP del worker (sin tocar DB ni hacer requests reales).
6. Si añadís UI, usá los componentes de `components/ui/`. Si necesitás un
   color, usá los tokens semánticos (`bg-accent`, `text-muted`, etc.),
   nunca `zinc-*` ni hex hardcodeado.
7. Si tocás el detalle de run, ten en cuenta el hueco Realtime (sección 8):
   cualquier cambio debe preservar `refetch()` y la repoblación de
   `caseIdsRef`.
