# Eliminar Redis/BullMQ — Worker HTTP en Render

**Fecha:** 2026-05-19
**Estado:** aprobado

## 1. Problema

La cola BullMQ + Upstash Redis hace polling continuo (`BRPOP`) desde el worker.
Eso consume ~500 000 comandos Redis al mes aunque no se ejecute ningún test, y
agotó el free tier de Upstash. El proyecto es un portafolio personal: la
infraestructura debe costar **$0**.

## 2. Objetivo

Eliminar BullMQ, ioredis y Upstash por completo. Reemplazar la cola por una
llamada HTTP directa de la API Route a un worker Express, y desplegar todo en
planes gratuitos.

## 3. Arquitectura final

```
Vercel (Next.js)  ──POST /run-test──>  Render free tier (worker Express)  ──>  Supabase
   API Route          Bearer secret       Gemini + Playwright                  DB · Storage · Realtime
```

- **Vercel** — frontend + API Routes (sin cambios de hosting).
- **Render.com free tier** — worker Express de larga duración. Se duerme tras
  15 min de inactividad; el cold start (~30-50 s) es aceptable para demos.
- **Supabase** — sin cambios (DB, Auth, Storage, Realtime).

Decisiones tomadas durante el brainstorming:

- Se elimina la funcionalidad de **reintentos**: migración `DROP COLUMN
retries`, fuera del stepper del formulario y del schema Zod.
- El worker corre con **concurrencia 1** (un solo Chromium a la vez): 512 MB de
  RAM no admiten dos.
- El worker hace un **barrido de runs huérfanos** al arrancar.
- SDK de Gemini: se mantiene **`@google/genai`** (el vigente, ya usado por el
  proyecto), no `@google/generative-ai` (deprecado).
- Motor de navegador: **`playwright-core` + `@sparticuz/chromium`** para caber
  en 512 MB. La lógica adaptativa de Playwright no cambia.

## 4. Flujo detallado

### En la request (`POST /api/test-runs`, Vercel — responde en ~1 s)

1. Auth + validación Zod + rate limit (5/min por usuario). Sin cambios.
2. Inserta `test_run` con `status = "pendiente"`.
3. Responde `201 { testRunId }` al instante → el frontend redirige a
   `/dashboard/runs/[id]`.
4. En un callback `after()` (no bloquea la respuesta) llama
   `triggerWorkerRun(testRunId)`.

### Entrega al worker

`after()` ejecuta `POST {WORKER_URL}/run-test`:

- Header `Authorization: Bearer {WORKER_SECRET}`.
- Body `{ "testRunId": "<uuid>" }`.
- `fetch` con `AbortSignal.timeout(55_000)` para tolerar el cold start de Render.
- Si el worker responde error o el fetch expira: la API Route marca el
  `test_run` como `fallido` vía el cliente admin de Supabase, con mensaje
  `"No se pudo contactar al worker (puede estar despertando). Reintenta en un
minuto."`.

### En el worker (Render — proceso de larga duración)

5. `server.ts` valida el `Bearer` secret. Si no coincide → `401`.
6. Valida el body con Zod (`{ testRunId: uuid }`). Si falla → `400`.
7. Responde **`202 Accepted`** de inmediato y encola el trabajo en un mutex
   interno de concurrencia 1.
8. `processTestRun(testRunId)` corre en background:
   - Marca `corriendo`.
   - Gemini genera el plan (`@google/genai`, sin cambios).
   - Persiste `test_cases` y `test_steps`.
   - Playwright ejecuta paso a paso, escribiendo en Supabase. Lógica adaptativa
     intacta (`findSubmitButton`, `verifyLoginOutcome`, etc.).
   - Marca el estado final del run.
9. Supabase Realtime alimenta `/dashboard/runs/[id]` en vivo. **El frontend no
   cambia** — la reconciliación (`refetch()`) sigue igual.

### Barrido de runs huérfanos

Al arrancar `server.ts` (cada cold start es un boot nuevo en Render free tier),
antes de aceptar tráfico se ejecuta `sweepOrphanRuns()`:

- `UPDATE test_runs SET status = 'fallido', error_message = '...', finished_at
= now()` para filas con `status IN ('pendiente','corriendo')` y `created_at <
now() - interval '10 minutes'`.
- El umbral de 10 min evita barrer un run recién insertado que justamente acaba
  de despertar al worker.

## 5. Estructura del worker

El worker es un paquete npm propio bajo `worker/`, autocontenido (Render lo
construye con `rootDir: worker`). El código de Playwright/Gemini que hoy vive en
`lib/` **se mueve** dentro de `worker/` — es un _move_, sin cambios de lógica.

```
worker/
  package.json         deps: express · playwright-core · @sparticuz/chromium ·
                        @google/genai · @supabase/supabase-js · zod
                        devDeps: tsx · typescript · @types/express · @types/node · vitest
  tsconfig.json
  server.ts            Express. POST /run-test (auth + Zod + 202 + encola).
                       GET /health. Llama sweepOrphanRuns() antes de listen().
  process-test-run.ts  Orquestador (movido desde worker/process-test-run.ts).
  concurrency.ts       Mutex/cola en memoria, concurrencia 1.
  sweep-orphan-runs.ts Barrido de runs huérfanos al arrancar.
  lib/
    gemini.ts              ← lib/gemini/generate-test-plan.ts
    execute-test-run.ts    ← lib/playwright/execute-test-run.ts
    adaptive-login.ts      ← lib/playwright/adaptive-login.ts (sin cambios de lógica)
    safe-url.ts            ← lib/playwright/safe-url.ts
    upload-screenshot.ts   ← lib/storage/upload-screenshot.ts
    supabase-admin.ts      cliente service-role; lee SUPABASE_URL (no NEXT_PUBLIC_)
    chromium-launch.ts     NUEVO — lanzamiento con playwright-core + @sparticuz/chromium
    test-plan.ts           ← lib/validation/test-plan.ts
    types.ts               TestType (unión de strings, redeclarada para el worker)
  test/
    adaptive-login.test.ts ← tests/lib/adaptive-login.test.ts (movido)
  vitest.config.ts
```

### `chromium-launch.ts` (único código nuevo de Playwright)

```ts
import sparticuz from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    args: sparticuz.args,
    executablePath: await sparticuz.executablePath(),
    headless: true,
  });
}
```

### Cambios en los archivos movidos

- `execute-test-run.ts`: el import pasa de `"playwright"` a `"playwright-core"`;
  `chromium.launch({ headless: true })` se reemplaza por `launchBrowser()`. El
  resto (ejecución de pasos, screenshots, logs, ventana de verificación
  adaptativa) queda **idéntico**.
- `adaptive-login.ts`, `safe-url.ts`: import `"playwright"` → `"playwright-core"`.
  Cero cambios de lógica.
- `process-test-run.ts`: se ajustan las rutas de import al nuevo layout. La
  lógica (timeouts, persistencia del plan, conteo de pasos) no cambia.
- `gemini.ts`: importa `TestType` desde `worker/lib/types.ts` en lugar de
  `lib/validation/test-run.ts`.
- `supabase-admin.ts`: lee `process.env.SUPABASE_URL` (el worker no es Next.js).

### `server.ts` — contrato HTTP

| Ruta        | Método | Auth                   | Respuesta                                                    |
| ----------- | ------ | ---------------------- | ------------------------------------------------------------ |
| `/run-test` | POST   | `Bearer WORKER_SECRET` | `202` aceptado · `401` secret inválido · `400` body inválido |
| `/health`   | GET    | —                      | `200 { ok: true }`                                           |

`POST /run-test` no espera a que termine el test: responde `202` y delega a
`concurrency.ts`. El worker es un proceso de larga duración, así que el trabajo
en background sobrevive a la respuesta HTTP (a diferencia de serverless).

## 6. Lado Vercel (Next.js)

### `lib/worker/trigger-worker.ts` (nuevo)

`triggerWorkerRun(testRunId)`: hace el `fetch` a `{WORKER_URL}/run-test` con el
header `Bearer` y `AbortSignal.timeout(55_000)`. Lanza error si la respuesta no
es OK. Se aísla en su módulo para poder mockearlo en los tests (igual que el
`enqueueTestRun` actual).

### `app/api/test-runs/route.ts` (modificado)

- Quita el import de `enqueueTestRun` y todo el bloque try/catch de encolado.
- Quita `retries` del `insert` y de la lógica de `attempts`.
- Tras el insert, llama `after(() => ...)` (de `next/server`): dentro,
  `triggerWorkerRun(testRun.id)`; si lanza, marca el run `fallido` con el
  cliente admin.
- Responde `201 { ok: true, testRunId }` sin esperar a `after()`.

`lib/supabase/admin.ts` **se conserva** en el lado Next.js (lo usa la ruta para
marcar `fallido` cuando el worker no responde). El worker tiene su propia copia
(`worker/lib/supabase-admin.ts`) porque lee otra variable de entorno.

### `lib/validation/test-run.ts` (modificado)

Se elimina `retries` de `baseFields`. `browser`, `device` y los demás campos no
cambian.

### `new-test-run-form.tsx` (modificado)

- Se elimina el stepper "Reintentos" de la sección "Configuración del runner"
  (la grilla pasa de 3 a 2 columnas: Navegador y Dispositivo).
- Se elimina `retries` del estado y del `buildPayload()`.
- Se corrige el copy que menciona "el worker": el texto sigue siendo válido
  (sí hay un worker), no requiere cambio funcional, solo revisión.

## 7. Migración de base de datos

Nuevo archivo `supabase/migrations/0006_drop_retries.sql`:

```sql
-- Elimina la configuración de reintentos: la cola BullMQ que los aplicaba
-- fue retirada. DROP COLUMN elimina también el constraint test_runs_retries_check.
alter table public.test_runs
  drop column retries;
```

## 8. Inventario de cambios de archivos

### Eliminar

- `worker/index.ts` (el worker BullMQ).
- `lib/queue/` completo (`connection.ts`, `test-run-queue.ts`).
- `lib/gemini/`, `lib/playwright/`, `lib/storage/` (movidos al worker).
- `lib/validation/test-plan.ts` (movido al worker).
- `Dockerfile`, `railway.json` (los reemplaza `render.yaml`).
- `tests/lib/adaptive-login.test.ts` (movido a `worker/test/`).
- Dependencias del `package.json` raíz: `bullmq`, `ioredis`, `playwright`,
  `@google/genai`.
- Script `worker` del `package.json` raíz.

### Crear

- `worker/server.ts`, `worker/package.json`, `worker/tsconfig.json`,
  `worker/vitest.config.ts`.
- `worker/concurrency.ts`, `worker/sweep-orphan-runs.ts`.
- `worker/lib/chromium-launch.ts`, `worker/lib/supabase-admin.ts`,
  `worker/lib/types.ts`.
- `lib/worker/trigger-worker.ts`.
- `render.yaml`.
- `supabase/migrations/0006_drop_retries.sql`.
- `.vercelignore` (no existe; debe excluir `worker/` del build de Vercel).

### Mover (a `worker/`, sin cambios de lógica salvo imports)

- `worker/process-test-run.ts` → permanece, ajusta imports.
- `lib/gemini/generate-test-plan.ts` → `worker/lib/gemini.ts`.
- `lib/playwright/execute-test-run.ts` → `worker/lib/execute-test-run.ts`.
- `lib/playwright/adaptive-login.ts` → `worker/lib/adaptive-login.ts`.
- `lib/playwright/safe-url.ts` → `worker/lib/safe-url.ts`.
- `lib/storage/upload-screenshot.ts` → `worker/lib/upload-screenshot.ts`.
- `lib/validation/test-plan.ts` → `worker/lib/test-plan.ts`.

### Modificar

- `app/api/test-runs/route.ts` — worker vía `after()` en vez de encolar.
- `lib/validation/test-run.ts` — quita `retries`.
- `app/dashboard/runs/new/_components/new-test-run-form.tsx` — quita el stepper.
- `package.json` raíz — quita deps y script.
- `tsconfig.json` raíz — añade `worker` a `exclude`.
- `tests/api/test-runs.test.ts` — mockea `trigger-worker` en vez de la cola.
- `tests/lib/validation/test-run.test.ts` — quita los casos de `retries`.
- `CLAUDE.md`, `docs/DEPLOY.md`, `README.md`, `.env.example` — nueva arquitectura.

## 9. Variables de entorno

| Servicio   | Variables                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Vercel** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_URL`, `WORKER_SECRET` |
| **Render** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `WORKER_SECRET`                                          |

- `WORKER_SECRET` va en **ambos** servicios (Vercel lo envía, Render lo valida).
- Se eliminan `UPSTASH_REDIS_URL` y `UPSTASH_REDIS_TOKEN` de todos lados.
- `.env.example` se actualiza; hay un segundo ejemplo para `worker/` o una
  sección separada.

## 10. Deploy en Render (`render.yaml`)

```yaml
services:
  - type: web
    name: ai-testing-worker
    runtime: node
    plan: free
    rootDir: worker
    buildCommand: npm install
    startCommand: npm start # → tsx server.ts
    healthCheckPath: /health
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: WORKER_SECRET
        sync: false
```

- El worker corre con `tsx` (sin paso de compilación), igual que hoy.
- `playwright-core` no descarga navegadores; `@sparticuz/chromium` trae su
  binario como paquete npm → el build entra en el free tier.

## 11. Estrategia de tests (TDD para lo nuevo)

- `tests/api/test-runs.test.ts`: deja de mockear `@/lib/queue/test-run-queue`;
  mockea `@/lib/worker/trigger-worker`. Se elimina la aserción de `attempts`/
  `retries`. El caso "marca fallido si no se puede encolar" se reescribe como
  "marca fallido si el worker no responde". El test debe invocar el callback de
  `after()` (mock de `next/server`).
- `tests/lib/validation/test-run.test.ts`: se quitan los casos de `retries`.
- `worker/test/adaptive-login.test.ts`: se mueve tal cual; el worker tiene su
  propio `vitest.config.ts`.
- Tests nuevos: `worker/concurrency.ts` (serializa, concurrencia 1) y
  `worker/sweep-orphan-runs.ts` (marca solo runs viejos, respeta el umbral).
- `npm test` raíz sigue cubriendo `tests/`; el worker corre sus tests con
  `npm test` dentro de `worker/`.

## 12. Riesgos asumidos

- **RAM en 512 MB.** `@sparticuz/chromium` ayuda con flags (`--single-process`,
  `--no-zygote`, sin GPU), pero una página pesada puede causar OOM y Render
  mata el proceso. Aceptable para demos de portafolio.
- **Cold start ~30-50 s** tras 15 min de inactividad. Si el worker tarda más de
  55 s en despertar, el `fetch` expira y el run queda `fallido` con mensaje
  claro para reintentar.
- **`playwright-core` + `@sparticuz/chromium`** es un combo conocido pero la
  versión de Chromium del paquete debe ser razonablemente compatible con
  `playwright-core`. Si el lanzamiento falla por librerías del SO ausentes en
  Render, el fallback es desplegar el worker con Dockerfile en lugar de
  `runtime: node`.
- Sin cola = sin reintento automático ante fallos de infraestructura
  (consistente con la decisión de eliminar reintentos).

## 13. Fuera de alcance

- Solución al cold start (warm-up pings, cron) — el usuario lo aceptó.
- Cambios en el frontend de `/dashboard/runs/[id]` y la reconciliación Realtime.
- Soporte de Firefox/WebKit (sigue deshabilitado en la UI).
- Migrar el hosting del frontend fuera de Vercel.
