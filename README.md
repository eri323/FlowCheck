# Plataforma de Testing Automatizado con IA

Pegás una URL, describís un flujo en lenguaje natural ("entrá con
`admin@demo.com / 1234`, andá a *Mis pedidos* y verificá que aparezcan 3
items"), y el sistema:

1. Llama a Gemini para traducir el prompt a un plan de testing estructurado.
2. Ejecuta cada paso en Chromium headless con Playwright.
3. Captura un screenshot por paso y lo sube a Supabase Storage.
4. Stream-ea el progreso en vivo al dashboard vía Supabase Realtime.

Equivalente real: [Testim.io](https://testim.io), [Mabl](https://mabl.com),
[Reflect.run](https://reflect.run) — pero construido desde cero como
proyecto de portafolio.

> **Demo:** _añadir GIF en `docs/demo.gif` cuando se grabe._

---

## Stack

| Capa            | Tecnología                          |
|-----------------|-------------------------------------|
| Frontend        | Next.js 16 (App Router) + Tailwind 4 |
| API             | API Routes de Next.js               |
| Auth + DB       | Supabase (Postgres, Auth, RLS)      |
| Tiempo real     | Supabase Realtime (WebSocket)       |
| Archivos        | Supabase Storage                    |
| IA              | `@google/genai` — `gemini-2.5-flash` con `responseMimeType: application/json` |
| Browser tests   | Playwright (Chromium headless)      |
| Cola de jobs    | BullMQ sobre Upstash Redis          |
| Validación      | Zod en cada ruta de API             |
| Tests           | Vitest + mocks manuales de Supabase y BullMQ |
| Deploy frontend | Vercel                              |
| Deploy worker   | Railway (Dockerfile con base `mcr.microsoft.com/playwright`) |

---

## Arquitectura

```
┌──────────────┐    POST /api/test-runs    ┌────────────┐
│  Next.js UI  │ ────────────────────────▶ │  API Route │
└──────┬───────┘                           └─────┬──────┘
       │ Supabase Realtime                       │ enqueue
       │ (test_runs, test_steps)                 ▼
       │                                  ┌────────────┐
       │                                  │   BullMQ   │
       │                                  │  (Upstash) │
       │                                  └─────┬──────┘
       │                                        │ job
       │                                        ▼
       │                                  ┌────────────┐
       │                                  │   Worker   │
       │                                  │ (Railway)  │
       │                                  └─────┬──────┘
       │                            Gemini ────▶│
       │                            Playwright ▶│
       │                            Storage ───▶│
       └────────────── DB writes ◀──────────────┘
```

El worker corre como proceso independiente porque los jobs duran 30–60s,
incompatibles con el tope de ejecución de Vercel Functions.

---

## Estructura del repo

```
app/
  api/test-runs/         # POST: encola job, valida con Zod, rate-limit
  auth/, login/, signup/ # Flujo de Supabase Auth
  dashboard/             # Vistas protegidas + reporte en vivo
lib/
  gemini/                # Llamada a Gemini con responseMimeType JSON
  playwright/            # Runner + safe-url + adaptive-login
  queue/                 # BullMQ + conexión Upstash
  storage/               # Subida de screenshots
  supabase/              # Clientes server / client / admin / middleware
  validation/            # Schemas Zod
worker/
  index.ts               # Worker BullMQ con concurrencia 3 y reintentos
  process-test-run.ts    # Lee plan → ejecuta Playwright → escribe DB
supabase/migrations/     # SQL versionado de tablas, RLS, Realtime
tests/api/               # Vitest sobre las rutas de API
docs/DEPLOY.md           # Guía paso a paso de despliegue
```

---

## Setup local

```bash
git clone <repo>
cd ai-testing-platform
npm install
npx playwright install chromium      # solo primera vez
cp .env.example .env.local           # rellenar con tus claves reales
```

Aplicar las migraciones de `supabase/migrations/` a tu proyecto de Supabase.
Crear bucket `screenshots` con lectura pública.

### Comandos

```bash
npm run dev          # Next.js en http://localhost:3000
npm run worker       # Worker BullMQ (proceso separado, dejarlo corriendo)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm test             # Vitest
npm run build        # Build de producción
```

`npm run worker` consume jobs de la cola; sin él, los test_runs se quedan
en `pending`.

---

## Detalle: detección adaptativa de login

Para `test_type === "login"`, el worker ignora los selectores literales que
sugiere Gemini para email / password / submit y los reemplaza por una
heurística (`lib/playwright/adaptive-login.ts`) que tolera variaciones de
idioma y maquetado entre apps. Tras un submit exitoso se abre una **ventana
de verificación** donde los `expect_*` consecutivos se marcan automáticamente
como `passed` (porque el redirect ya validó el login). Los pasos resueltos
por la heurística aparecen con prefijo `[adaptive]` en la columna `selector`.

Detalles completos en `CLAUDE.md`.

---

## Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY` **nunca** llevan prefijo
  `NEXT_PUBLIC_`. La service role vive solo en API Routes y worker;
  Gemini solo en el worker.
- Toda entrada del usuario se valida con Zod antes de tocar la DB.
- Las URLs del usuario se filtran con `lib/playwright/safe-url.ts`
  (solo `http`/`https`, sin `file://`, `javascript:`, `data:`).
- Rate limit en `POST /api/test-runs`: 5 runs por minuto por usuario.
  Devuelve `429` con `Retry-After: 60`.
- RLS activado en todas las tablas. El `user_id` se lee de la sesión
  de Supabase, **nunca** del body.

---

## Despliegue

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md) — guía completa de Supabase, Upstash,
Vercel y Railway con checklist de verificación post-deploy.

---

## Roadmap

Estado de cada fase: ver sección *Roadmap* en `CLAUDE.md`.
Las fases 1–5 están implementadas; la fase 6 (deploy a producción)
es la que documenta este README.
