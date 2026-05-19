# Eliminar Redis/BullMQ — Worker HTTP en Render · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la cola BullMQ + Upstash Redis por una llamada HTTP directa desde la API Route de Vercel a un worker Express desplegado en Render free tier.

**Architecture:** Vercel (Next.js) inserta el `test_run` y delega vía `POST /run-test` a un worker Express de larga duración en Render, que genera el plan con Gemini y ejecuta Playwright (`playwright-core` + `@sparticuz/chromium`). El worker pasa a ser un paquete npm autocontenido bajo `worker/`. Supabase no cambia.

**Tech Stack:** Next.js 16, Express 5, `playwright-core`, `@sparticuz/chromium`, `@google/genai`, Supabase, Zod, Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-05-19-eliminar-redis-worker-render-design.md`

---

## Notas de orden y verificación

- **Fase A (T1-T2):** preparación. **Fase B (T3-T6):** lado Next.js. **Fase C (T7-T14):** paquete worker. **Fase D (T15-T16):** limpieza y docs.
- Tras cada tarea de la Fase B, la app Next.js queda verde: `npm run typecheck`, `npm run lint`, `npm test`.
- En la Fase C, el typecheck completo del worker (`cd worker && npm run typecheck`) **no es fiable hasta T13**, porque `worker/process-test-run.ts` mantiene imports a `../lib/...` hasta T12. Por eso T8-T12 se verifican con el test Vitest de cada módulo (Vitest transpila por archivo, no typechequea el proyecto). El gate de typecheck integral es T14.
- Comandos: en la raíz se corre con `npm`; dentro del worker, `cd worker && npm ...`.

---

## Task 1: Migración — eliminar la columna `retries`

**Files:**
- Create: `supabase/migrations/0006_drop_retries.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- =====================================================================
-- Elimina la configuración de reintentos. La cola BullMQ que aplicaba los
-- reintentos a nivel de job fue retirada del proyecto, así que la columna
-- ya no tiene uso. DROP COLUMN elimina también el constraint
-- test_runs_retries_check creado en 0005_runner_config.sql.
-- Para correr esta migración: pegar este archivo en el SQL Editor del
-- proyecto en Supabase y ejecutarlo.
-- =====================================================================

alter table public.test_runs
  drop column retries;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0006_drop_retries.sql
git commit -m "feat(db): migracion para eliminar la columna retries de test_runs"
```

Nota: la migración se **aplica manualmente** en Supabase al desplegar (igual que 0001-0005). El código de T6 deja de enviar `retries` en el insert antes de que la columna desaparezca; como la columna tiene `default 1`, el insert funciona con o sin la columna.

---

## Task 2: Desacoplar `worker/` del tooling de la raíz

**Files:**
- Modify: `tsconfig.json:36`
- Modify: `eslint.config.mjs:10`
- Modify: `.gitignore`
- Create: `.vercelignore`

- [ ] **Step 1: Excluir `worker/` del typecheck de la raíz**

En `tsconfig.json`, cambiar la línea `exclude`:

```json
  "exclude": ["node_modules", "worker"]
```

- [ ] **Step 2: Excluir `worker/` del lint de la raíz**

En `eslint.config.mjs`, cambiar la línea de `globalIgnores`:

```js
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "worker/**"]),
```

- [ ] **Step 3: Ignorar `worker/node_modules` en git**

En `.gitignore`, bajo la sección `# dependencies`, añadir:

```
worker/node_modules
```

- [ ] **Step 4: Crear `.vercelignore`**

Crear `.vercelignore` con este contenido (evita que Vercel construya el worker):

```
worker
```

- [ ] **Step 5: Verificar que la raíz sigue verde**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS (el worker viejo queda fuera del typecheck/lint; los tests no cambian).

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json eslint.config.mjs .gitignore .vercelignore
git commit -m "chore: desacopla el directorio worker del tooling de la raiz"
```

---

## Task 3: Cliente HTTP del worker — `triggerWorkerRun`

**Files:**
- Create: `lib/worker/trigger-worker.ts`
- Test: `tests/lib/trigger-worker.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/lib/trigger-worker.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerWorkerRun } from "@/lib/worker/trigger-worker";

describe("triggerWorkerRun", () => {
  beforeEach(() => {
    process.env.WORKER_URL = "https://worker.test";
    process.env.WORKER_SECRET = "s3cr3t";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WORKER_URL;
    delete process.env.WORKER_SECRET;
  });

  it("hace POST a /run-test con el secreto y el testRunId", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    await triggerWorkerRun("run-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.test/run-test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer s3cr3t" }),
        body: JSON.stringify({ testRunId: "run-1" }),
      }),
    );
  });

  it("lanza error si el worker responde con estado no OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    await expect(triggerWorkerRun("run-1")).rejects.toThrow("estado 500");
  });

  it("lanza error si faltan las variables de entorno", async () => {
    delete process.env.WORKER_URL;
    await expect(triggerWorkerRun("run-1")).rejects.toThrow("WORKER_URL");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- trigger-worker`
Expected: FAIL — `Cannot find module '@/lib/worker/trigger-worker'`.

- [ ] **Step 3: Implementar `triggerWorkerRun`**

Crear `lib/worker/trigger-worker.ts`:

```ts
const WORKER_TIMEOUT_MS = 55_000;

/**
 * Dispara la ejecución de un test_run en el worker de Render. El worker
 * responde 202 apenas recibe la petición; el timeout de 55 s tolera el
 * cold start del free tier (el worker se duerme tras 15 min).
 */
export async function triggerWorkerRun(testRunId: string): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new Error(
      "WORKER_URL o WORKER_SECRET no están configuradas en el entorno",
    );
  }

  const response = await fetch(`${workerUrl}/run-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerSecret}`,
    },
    body: JSON.stringify({ testRunId }),
    signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`El worker respondió con estado ${response.status}`);
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- trigger-worker`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/worker/trigger-worker.ts tests/lib/trigger-worker.test.ts
git commit -m "feat(api): cliente HTTP triggerWorkerRun para delegar al worker"
```

---

## Task 4: API Route — delegar al worker vía `after()`

**Files:**
- Modify: `app/api/test-runs/route.ts` (reescritura completa)
- Test: `tests/api/test-runs.test.ts` (reescritura completa)

- [ ] **Step 1: Reescribir el test con las nuevas expectativas**

Reemplazar todo el contenido de `tests/api/test-runs.test.ts` con:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks: Array<() => unknown> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb);
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/worker/trigger-worker", () => ({
  triggerWorkerRun: vi.fn(),
}));

type AuthUser = { id: string } | null;
type SupabaseError = { message: string } | null;

type SupabaseMockOptions = {
  user: AuthUser;
  authError?: SupabaseError;
  recentCount?: number;
  rateError?: SupabaseError;
  insertData?: { id: string } | null;
  insertError?: SupabaseError;
};

type SupabaseMock = {
  client: unknown;
  inserts: Array<Record<string, unknown>>;
};

function makeSupabaseMock(opts: SupabaseMockOptions): SupabaseMock {
  const inserts: Array<Record<string, unknown>> = [];

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user },
        error: opts.authError ?? null,
      }),
    },
    from: vi.fn(() => {
      let mode: "count" | "insert" | "idle" = "idle";
      const builder: Record<string, unknown> = {};

      builder.select = vi.fn(
        (_cols: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === "exact" && options.head === true) {
            mode = "count";
          }
          return builder;
        },
      );
      builder.insert = vi.fn((payload: Record<string, unknown>) => {
        mode = "insert";
        inserts.push(payload);
        return builder;
      });
      builder.eq = vi.fn(() => builder);
      builder.gte = vi.fn(() => builder);
      builder.single = vi.fn(async () => ({
        data: opts.insertData ?? null,
        error: opts.insertError ?? null,
      }));
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        if (mode === "count") {
          return Promise.resolve({
            count: opts.recentCount ?? 0,
            error: opts.rateError ?? null,
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      };
      return builder;
    }),
  };

  return { client, inserts };
}

type AdminMock = { client: unknown; updates: Array<Record<string, unknown>> };

function makeAdminMock(): AdminMock {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.update = vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return builder;
      });
      builder.eq = vi.fn(async () => ({ data: null, error: null }));
      return builder;
    }),
  };
  return { client, updates };
}

function makeRequest(body: unknown, options: { rawBody?: string } = {}): Request {
  return new Request("http://localhost/api/test-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

async function runAfterCallbacks(): Promise<void> {
  for (const cb of afterCallbacks) {
    await cb();
  }
}

const validBody = {
  test_type: "navegacion" as const,
  test_data: {},
  target_url: "https://example.com",
};

async function loadRoute() {
  const route = await import("@/app/api/test-runs/route");
  const supabaseServer = await import("@/lib/supabase/server");
  const admin = await import("@/lib/supabase/admin");
  const worker = await import("@/lib/worker/trigger-worker");
  return {
    POST: route.POST,
    createSupabaseServerClient: vi.mocked(
      supabaseServer.createSupabaseServerClient,
    ),
    createSupabaseAdminClient: vi.mocked(admin.createSupabaseAdminClient),
    triggerWorkerRun: vi.mocked(worker.triggerWorkerRun),
  };
}

describe("POST /api/test-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
  });

  it("devuelve 401 si no hay usuario autenticado", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: null });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it("devuelve 400 si el body no es JSON", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" } });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(undefined, { rawBody: "no-es-json" }));
    expect(response.status).toBe(400);
  });

  it("devuelve 400 si la validación de Zod falla", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" } });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(
      makeRequest({
        test_type: "navegacion",
        test_data: {},
        target_url: "javascript:alert(1)",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("devuelve 429 cuando el usuario supera el rate limit", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" }, recentCount: 5 });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(triggerWorkerRun).not.toHaveBeenCalled();
  });

  it("devuelve 201 y dispara el worker cuando todo es válido", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client } = makeSupabaseMock({
      user: { id: "u1" },
      recentCount: 2,
      insertData: { id: "run-123" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    triggerWorkerRun.mockResolvedValue(undefined);

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, testRunId: "run-123" });

    await runAfterCallbacks();
    expect(triggerWorkerRun).toHaveBeenCalledWith("run-123");
  });

  it("persiste browser y device en el insert", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client, inserts } = makeSupabaseMock({
      user: { id: "u1" },
      recentCount: 0,
      insertData: { id: "run-r" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    triggerWorkerRun.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ ...validBody, device: "mobile" }));
    expect(response.status).toBe(201);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ browser: "chromium", device: "mobile" });
    expect(inserts[0]).not.toHaveProperty("retries");
  });

  it("devuelve 500 si falla la inserción en la DB", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client } = makeSupabaseMock({
      user: { id: "u1" },
      insertData: null,
      insertError: { message: "boom" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    expect(triggerWorkerRun).not.toHaveBeenCalled();
  });

  it("marca el run como fallido si no se puede contactar al worker", async () => {
    const {
      POST,
      createSupabaseServerClient,
      createSupabaseAdminClient,
      triggerWorkerRun,
    } = await loadRoute();
    const { client } = makeSupabaseMock({
      user: { id: "u1" },
      insertData: { id: "run-xyz" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    const admin = makeAdminMock();
    createSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof createSupabaseAdminClient>,
    );
    triggerWorkerRun.mockRejectedValue(new Error("worker dormido"));

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);

    await runAfterCallbacks();
    expect(admin.updates).toHaveLength(1);
    expect(admin.updates[0]).toMatchObject({ status: "fallido" });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- test-runs`
Expected: FAIL — la ruta todavía importa `enqueueTestRun` y no usa `after`/`triggerWorkerRun`.

- [ ] **Step 3: Reescribir la API Route**

Reemplazar todo el contenido de `app/api/test-runs/route.ts` con:

```ts
import { after, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createTestRunSchema } from "@/lib/validation/test-run";
import { triggerWorkerRun } from "@/lib/worker/trigger-worker";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_JOBS = 5;

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, message: "No autenticado" },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Body inválido (no es JSON)" },
      { status: 400 },
    );
  }

  const parseResult = createTestRunSchema.safeParse(payload);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Datos inválidos",
        errors: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount, error: rateError } = await supabase
    .from("test_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", windowStart);

  if (rateError) {
    return NextResponse.json(
      {
        ok: false,
        message: `No se pudo verificar el rate limit: ${rateError.message}`,
      },
      { status: 500 },
    );
  }

  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_JOBS) {
    return NextResponse.json(
      {
        ok: false,
        message: `Has alcanzado el límite de ${RATE_LIMIT_MAX_JOBS} test runs por minuto. Espera unos segundos antes de intentar de nuevo.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000) },
      },
    );
  }

  const input = parseResult.data;

  const { data: testRun, error: insertError } = await supabase
    .from("test_runs")
    .insert({
      user_id: user.id,
      project_id: input.project_id ?? null,
      target_url: input.target_url,
      test_type: input.test_type,
      test_data: input.test_data,
      prompt: input.prompt ?? null,
      browser: input.browser,
      device: input.device,
      status: "pendiente",
    })
    .select("id")
    .single();

  if (insertError || !testRun) {
    return NextResponse.json(
      {
        ok: false,
        message: `No se pudo crear el test run: ${insertError?.message ?? "error desconocido"}`,
      },
      { status: 500 },
    );
  }

  const testRunId = testRun.id;

  // El worker se contacta tras enviar la respuesta: el frontend recibe el
  // 201 al instante y redirige a /dashboard/runs/[id]. Si el worker no
  // responde (puede estar despertando), el run se marca como fallido.
  after(async () => {
    try {
      await triggerWorkerRun(testRunId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      const admin = createSupabaseAdminClient();
      await admin
        .from("test_runs")
        .update({
          status: "fallido",
          error_message: `No se pudo contactar al worker (${message}). Puede estar despertando — reintenta en un minuto.`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", testRunId);
    }
  });

  return NextResponse.json({ ok: true, testRunId }, { status: 201 });
}
```

Nota: `after` es estable en `next/server` en Next.js 16. Si el typecheck reporta que `after` no se exporta, consultar `node_modules/next/dist/docs/` y usar el nombre correcto en la versión instalada.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- test-runs`
Expected: PASS (8 tests).

- [ ] **Step 5: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS. (`lib/queue/` sigue existiendo; nada lo importa ya — se borra en T5.)

- [ ] **Step 6: Commit**

```bash
git add app/api/test-runs/route.ts tests/api/test-runs.test.ts
git commit -m "refactor(api): la ruta delega al worker HTTP en vez de encolar en BullMQ"
```

---

## Task 5: Eliminar `lib/queue/`

**Files:**
- Delete: `lib/queue/connection.ts`, `lib/queue/test-run-queue.ts`

- [ ] **Step 1: Borrar el directorio de la cola**

```bash
git rm lib/queue/connection.ts lib/queue/test-run-queue.ts
```

- [ ] **Step 2: Verificar que la raíz sigue verde**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS — nada en `app/` ni `lib/` importa `lib/queue/` (la ruta se reescribió en T4).

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: elimina lib/queue (BullMQ + conexion Upstash)"
```

---

## Task 6: Eliminar la funcionalidad de reintentos

**Files:**
- Modify: `lib/validation/test-run.ts:100-108`
- Modify: `app/dashboard/runs/new/_components/new-test-run-form.tsx`
- Test: `tests/lib/validation/test-run.test.ts`

- [ ] **Step 1: Actualizar el test del schema Zod**

En `tests/lib/validation/test-run.test.ts`:

En el test `"aplica los defaults de runner cuando no se envían"`, **eliminar** la línea:

```ts
      expect(result.data.retries).toBe(1);
```

Reemplazar el test `"acepta device 'mobile' y un número de reintentos válido"` completo por:

```ts
  it("acepta device 'mobile'", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      browser: "chromium",
      device: "mobile",
    });
    expect(result.success).toBe(true);
  });
```

**Eliminar** por completo el test `"rechaza un número de reintentos fuera de rango"`.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- validation/test-run`
Expected: FAIL — `result.data.retries` ya no se asevera pero el schema aún lo define; el typecheck del test puede quejarse. Confirma que el archivo de test ya no menciona `retries`.

- [ ] **Step 3: Quitar `retries` del schema Zod**

En `lib/validation/test-run.ts`, en el objeto `baseFields`, eliminar la línea de `retries`. El objeto queda:

```ts
const baseFields = {
  target_url: httpUrlSchema,
  prompt: extraPromptSchema,
  project_id: z.uuid().optional(),
  // Este ciclo solo Chromium es ejecutable; la columna de DB admite los 3.
  browser: z.literal("chromium").default("chromium"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
};
```

- [ ] **Step 4: Quitar el stepper "Reintentos" del formulario**

En `app/dashboard/runs/new/_components/new-test-run-form.tsx`:

1. Eliminar el estado: la línea `const [retries, setRetries] = useState(1);`.
2. En `buildPayload()`, en el objeto `base`, eliminar la línea `retries,`.
3. En la sección "Configuración del runner", cambiar la grilla de 3 a 2 columnas: `className="grid grid-cols-1 gap-5 sm:grid-cols-3"` → `sm:grid-cols-2`.
4. Eliminar el bloque `<div>` completo del control "Reintentos" (el `<div className="flex flex-col gap-1.5">` que contiene el `<span>` "Reintentos" y los botones `−` / `+` con `setRetries`).

- [ ] **Step 5: Verificar typecheck, lint y tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. `tsc` confirma que no quedan referencias a `retries`.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/test-run.ts app/dashboard/runs/new/_components/new-test-run-form.tsx tests/lib/validation/test-run.test.ts
git commit -m "refactor: elimina la funcionalidad de reintentos del schema y la UI"
```

---

## Task 7: Scaffold del paquete worker

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/.env.example`
- Delete: `worker/index.ts`

- [ ] **Step 1: Crear `worker/package.json`**

```json
{
  "name": "ai-testing-worker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "tsx server.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@google/genai": "^2.2.0",
    "@sparticuz/chromium": "^131.0.0",
    "@supabase/supabase-js": "^2.105.4",
    "express": "^5.1.0",
    "playwright-core": "^1.60.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^20",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5",
    "vitest": "^4.1.6"
  }
}
```

- [ ] **Step 2: Crear `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Crear `worker/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 4: Crear `worker/.env.example`**

```
# Variables del worker — configurar en Render (render.yaml las declara).
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
WORKER_SECRET=
PORT=3001
```

- [ ] **Step 5: Borrar el worker BullMQ viejo**

```bash
git rm worker/index.ts
```

(`worker/process-test-run.ts` se conserva; sus imports se ajustan en T12.)

- [ ] **Step 6: Instalar las dependencias del worker**

Run: `cd worker && npm install`
Expected: instala sin errores; se crea `worker/node_modules` y `worker/package-lock.json`.

Nota de versión: si más adelante (T14 o en deploy) `launchBrowser()` falla por incompatibilidad de protocolo, ajustar la versión de `@sparticuz/chromium` a una cuyo Chromium sea compatible con `playwright-core@1.60`.

- [ ] **Step 7: Commit**

```bash
cd .. && git add worker/package.json worker/tsconfig.json worker/vitest.config.ts worker/.env.example worker/package-lock.json && git rm --cached worker/index.ts 2>/dev/null; git commit -m "chore(worker): scaffold del paquete worker y baja del worker BullMQ"
```

---

## Task 8: Cola de concurrencia 1 del worker

**Files:**
- Create: `worker/concurrency.ts`
- Test: `worker/test/concurrency.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `worker/test/concurrency.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { enqueueExclusive } from "../concurrency";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("enqueueExclusive", () => {
  it("ejecuta las tareas de a una, sin solaparlas", async () => {
    const events: string[] = [];

    enqueueExclusive(async () => {
      events.push("A:start");
      await wait(20);
      events.push("A:end");
    });
    enqueueExclusive(async () => {
      events.push("B:start");
      await wait(5);
      events.push("B:end");
    });

    await wait(60);
    expect(events).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  it("sigue procesando aunque una tarea lance error", async () => {
    const events: string[] = [];
    enqueueExclusive(async () => {
      throw new Error("boom");
    });
    enqueueExclusive(async () => {
      events.push("ok");
    });
    await wait(30);
    expect(events).toEqual(["ok"]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd worker && npx vitest run test/concurrency.test.ts`
Expected: FAIL — `Cannot find module '../concurrency'`.

- [ ] **Step 3: Implementar `concurrency.ts`**

Crear `worker/concurrency.ts`:

```ts
/**
 * Cola en memoria que ejecuta tareas de a una (concurrencia 1). El worker
 * corre en Render free tier con 512 MB de RAM: dos Chromium simultáneos la
 * agotarían, así que los runs se serializan.
 */
type Task = () => Promise<void>;

const pending: Task[] = [];
let draining = false;

export function enqueueExclusive(task: Task): void {
  pending.push(task);
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (pending.length > 0) {
    const task = pending.shift()!;
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] una tarea de la cola falló: ${message}`);
    }
  }
  draining = false;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd worker && npx vitest run test/concurrency.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd .. && git add worker/concurrency.ts worker/test/concurrency.test.ts
git commit -m "feat(worker): cola en memoria con concurrencia 1"
```

---

## Task 9: Cliente admin y barrido de runs huérfanos

**Files:**
- Create: `worker/lib/supabase-admin.ts`
- Create: `worker/sweep-orphan-runs.ts`
- Test: `worker/test/sweep-orphan-runs.test.ts`

- [ ] **Step 1: Crear el cliente admin del worker**

Crear `worker/lib/supabase-admin.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con service role para el worker. Usa SUPABASE_URL
 * (el worker no es Next.js, no hay prefijo NEXT_PUBLIC_).
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Escribir el test del barrido que falla**

Crear `worker/test/sweep-orphan-runs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { sweepOrphanRuns } from "../sweep-orphan-runs";
import { createSupabaseAdminClient } from "../lib/supabase-admin";

type QueryResult = { data: unknown; error: unknown };

function makeClient(result: QueryResult) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn((payload: unknown) => {
    calls.update = payload;
    return builder;
  });
  builder.in = vi.fn((col: string, vals: unknown) => {
    calls.in = { col, vals };
    return builder;
  });
  builder.lt = vi.fn((col: string, val: unknown) => {
    calls.lt = { col, val };
    return builder;
  });
  builder.select = vi.fn(() => Promise.resolve(result));
  return { client: { from: vi.fn(() => builder) }, calls };
}

describe("sweepOrphanRuns", () => {
  it("marca fallidos los runs pendientes/corriendo viejos y devuelve el conteo", async () => {
    const { client, calls } = makeClient({
      data: [{ id: "r1" }, { id: "r2" }],
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);

    const count = await sweepOrphanRuns();

    expect(count).toBe(2);
    expect(calls.in).toEqual({
      col: "status",
      vals: ["pendiente", "corriendo"],
    });
    expect((calls.lt as { col: string }).col).toBe("created_at");
    expect((calls.update as { status: string }).status).toBe("fallido");
  });

  it("devuelve 0 si la query falla", async () => {
    const { client } = makeClient({ data: null, error: { message: "boom" } });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    expect(await sweepOrphanRuns()).toBe(0);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `cd worker && npx vitest run test/sweep-orphan-runs.test.ts`
Expected: FAIL — `Cannot find module '../sweep-orphan-runs'`.

- [ ] **Step 4: Implementar `sweep-orphan-runs.ts`**

Crear `worker/sweep-orphan-runs.ts`:

```ts
import { createSupabaseAdminClient } from "./lib/supabase-admin";

const STALE_MINUTES = 10;

/**
 * Marca como "fallido" los runs que quedaron en "pendiente" o "corriendo"
 * por más de STALE_MINUTES. Cubre los runs huérfanos por un reinicio del
 * worker (Render free tier duerme y reinicia el proceso). Se llama al
 * arrancar el servidor. Devuelve cuántos runs barrió.
 */
export async function sweepOrphanRuns(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const threshold = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from("test_runs")
    .update({
      status: "fallido",
      error_message: "El worker se reinició y el run quedó interrumpido.",
      finished_at: new Date().toISOString(),
    })
    .in("status", ["pendiente", "corriendo"])
    .lt("created_at", threshold)
    .select("id");

  if (error) {
    console.error(`[worker] el barrido de runs huérfanos falló: ${error.message}`);
    return 0;
  }

  return data?.length ?? 0;
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd worker && npx vitest run test/sweep-orphan-runs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd .. && git add worker/lib/supabase-admin.ts worker/sweep-orphan-runs.ts worker/test/sweep-orphan-runs.test.ts
git commit -m "feat(worker): cliente admin y barrido de runs huerfanos al arrancar"
```

---

## Task 10: Mover el stack de Playwright al worker

**Files:**
- Create: `worker/lib/types.ts`, `worker/lib/chromium-launch.ts`
- Move: `lib/storage/upload-screenshot.ts` → `worker/lib/upload-screenshot.ts`
- Move: `lib/playwright/safe-url.ts` → `worker/lib/safe-url.ts`
- Move: `lib/playwright/adaptive-login.ts` → `worker/lib/adaptive-login.ts`
- Move: `lib/playwright/execute-test-run.ts` → `worker/lib/execute-test-run.ts`
- Move: `tests/lib/adaptive-login.test.ts` → `worker/test/adaptive-login.test.ts`

- [ ] **Step 1: Crear `worker/lib/types.ts`**

```ts
export const TEST_TYPES = [
  "login",
  "registro",
  "busqueda",
  "navegacion",
  "formulario",
  "ecommerce",
] as const;

export type TestType = (typeof TEST_TYPES)[number];
```

- [ ] **Step 2: Crear `worker/lib/chromium-launch.ts`**

```ts
import sparticuz from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";

/**
 * Lanza Chromium con el binario recortado de @sparticuz/chromium y sus
 * flags de bajo consumo (--single-process, --no-zygote, sin GPU), para
 * caber en los 512 MB de RAM del free tier de Render.
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    args: sparticuz.args,
    executablePath: await sparticuz.executablePath(),
    headless: true,
  });
}
```

- [ ] **Step 3: Mover los archivos con `git mv`**

```bash
git mv lib/storage/upload-screenshot.ts worker/lib/upload-screenshot.ts
git mv lib/playwright/safe-url.ts worker/lib/safe-url.ts
git mv lib/playwright/adaptive-login.ts worker/lib/adaptive-login.ts
git mv lib/playwright/execute-test-run.ts worker/lib/execute-test-run.ts
git mv tests/lib/adaptive-login.test.ts worker/test/adaptive-login.test.ts
```

- [ ] **Step 4: Ajustar el import en `worker/lib/adaptive-login.ts`**

Cambiar la línea 1:

```ts
import type { Locator, Page } from "playwright-core";
```

- [ ] **Step 5: Ajustar el import en `worker/test/adaptive-login.test.ts`**

Cambiar la línea de import del módulo bajo prueba:

```ts
import {
  isEmailFillSelector,
  isLoginSubmitSelector,
  isPasswordFillSelector,
  looksLikeEmail,
} from "../lib/adaptive-login";
```

- [ ] **Step 6: Ajustar los imports en `worker/lib/execute-test-run.ts`**

Reemplazar el bloque de imports inicial (líneas 1-21) por:

```ts
import {
  devices,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "playwright-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { launchBrowser } from "./chromium-launch";
import { uploadScreenshot } from "./upload-screenshot";
import { assertSafeNavigationUrl } from "./safe-url";
import type { TestType } from "./types";
import {
  fillIdentifierField,
  findPasswordField,
  findSubmitButton,
  isEmailFillSelector,
  isLoginSubmitSelector,
  isPasswordFillSelector,
  verifyLoginOutcome,
  type LoginOutcome,
} from "./adaptive-login";
```

Y reemplazar la línea de lanzamiento del navegador (era `const browser = await chromium.launch({ headless: true });`) por:

```ts
  const browser = await launchBrowser();
```

(El resto de `execute-test-run.ts` —ejecución de pasos, screenshots, logs, ventana de verificación adaptativa— no cambia.)

- [ ] **Step 7: Verificar la app Next.js y el test movido**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS — nada en `app/` ni `lib/` importaba estos archivos.

Run: `cd worker && npx vitest run test/adaptive-login.test.ts`
Expected: PASS (los tests de `adaptive-login` corren contra la nueva ubicación).

- [ ] **Step 8: Commit**

```bash
cd .. && git add worker/lib tests worker/test lib
git commit -m "refactor(worker): mueve el stack de Playwright al paquete worker"
```

---

## Task 11: Mover Gemini y el schema del plan al worker

**Files:**
- Move: `lib/gemini/generate-test-plan.ts` → `worker/lib/gemini.ts`
- Move: `lib/validation/test-plan.ts` → `worker/lib/test-plan.ts`

- [ ] **Step 1: Mover los archivos con `git mv`**

```bash
git mv lib/gemini/generate-test-plan.ts worker/lib/gemini.ts
git mv lib/validation/test-plan.ts worker/lib/test-plan.ts
```

- [ ] **Step 2: Ajustar los imports en `worker/lib/gemini.ts`**

Cambiar las líneas 2-3:

```ts
import { testPlanSchema, type TestPlan } from "./test-plan";
import type { TestType } from "./types";
```

(El resto de `gemini.ts` no cambia; sigue usando `@google/genai`.)

- [ ] **Step 3: Verificar la app Next.js**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS — ningún archivo de `app/` ni del `lib/` restante importa `gemini` ni `test-plan`.

- [ ] **Step 4: Commit**

```bash
git add worker/lib lib
git commit -m "refactor(worker): mueve la generacion con Gemini y el schema del plan al worker"
```

---

## Task 12: Ajustar imports de `worker/process-test-run.ts`

**Files:**
- Modify: `worker/process-test-run.ts:1-9`

- [ ] **Step 1: Reescribir el bloque de imports**

En `worker/process-test-run.ts`, reemplazar las líneas 1-9 por:

```ts
import { createSupabaseAdminClient } from "./lib/supabase-admin";
import {
  generateTestPlan,
  TestPlanGenerationError,
  type GenerateTestPlanInput,
} from "./lib/gemini";
import { executeTestRun } from "./lib/execute-test-run";
import type { TestCaseDraft, TestStepDraft } from "./lib/test-plan";
import type { TestType } from "./lib/types";
```

(El resto de `process-test-run.ts` —`withTimeout`, `persistTestPlan`, `buildGeneratorInput`, `processTestRun`— no cambia.)

- [ ] **Step 2: Verificar el typecheck del worker**

Run: `cd worker && npm run typecheck`
Expected: PASS — todos los módulos del worker (salvo `server.ts`, que aún no existe) resuelven sus imports.

- [ ] **Step 3: Commit**

```bash
cd .. && git add worker/process-test-run.ts
git commit -m "refactor(worker): ajusta imports de process-test-run al layout del worker"
```

---

## Task 13: Servidor Express del worker

**Files:**
- Create: `worker/server.ts`
- Test: `worker/test/server.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `worker/test/server.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../concurrency", () => ({ enqueueExclusive: vi.fn() }));
vi.mock("../process-test-run", () => ({ processTestRun: vi.fn() }));
vi.mock("../sweep-orphan-runs", () => ({ sweepOrphanRuns: vi.fn() }));

import { createApp } from "../server";
import { enqueueExclusive } from "../concurrency";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

describe("worker server — POST /run-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKER_SECRET = "s3cr3t";
  });
  afterEach(() => {
    delete process.env.WORKER_SECRET;
  });

  it("responde 401 sin el secreto correcto", async () => {
    const res = await request(createApp())
      .post("/run-test")
      .set("Authorization", "Bearer wrong")
      .send({ testRunId: VALID_ID });
    expect(res.status).toBe(401);
    expect(enqueueExclusive).not.toHaveBeenCalled();
  });

  it("responde 400 si el body es inválido", async () => {
    const res = await request(createApp())
      .post("/run-test")
      .set("Authorization", "Bearer s3cr3t")
      .send({ testRunId: "no-es-uuid" });
    expect(res.status).toBe(400);
    expect(enqueueExclusive).not.toHaveBeenCalled();
  });

  it("responde 202 y encola el run cuando todo es válido", async () => {
    const res = await request(createApp())
      .post("/run-test")
      .set("Authorization", "Bearer s3cr3t")
      .send({ testRunId: VALID_ID });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, testRunId: VALID_ID });
    expect(enqueueExclusive).toHaveBeenCalledTimes(1);
  });

  it("responde 200 en /health", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd worker && npx vitest run test/server.test.ts`
Expected: FAIL — `Cannot find module '../server'`.

- [ ] **Step 3: Implementar `server.ts`**

Crear `worker/server.ts`:

```ts
import express from "express";
import { z } from "zod";
import { enqueueExclusive } from "./concurrency";
import { processTestRun } from "./process-test-run";
import { sweepOrphanRuns } from "./sweep-orphan-runs";

const runTestSchema = z.object({ testRunId: z.uuid() });

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/run-test", (req, res) => {
    const secret = process.env.WORKER_SECRET;
    if (!secret || req.header("authorization") !== `Bearer ${secret}`) {
      res.status(401).json({ ok: false, message: "No autorizado" });
      return;
    }

    const parsed = runTestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ ok: false, message: "Body inválido: se espera { testRunId: uuid }" });
      return;
    }

    const { testRunId } = parsed.data;
    // 202 inmediato: el trabajo pesado corre en background, serializado.
    enqueueExclusive(async () => {
      await processTestRun(testRunId);
    });
    res.status(202).json({ ok: true, testRunId });
  });

  return app;
}

async function main(): Promise<void> {
  const swept = await sweepOrphanRuns();
  if (swept > 0) {
    console.log(
      `[worker] ${swept} run(s) huérfano(s) marcados como fallido al arrancar`,
    );
  }
  const port = Number(process.env.PORT) || 3001;
  createApp().listen(port, () => {
    console.log(`[worker] escuchando en el puerto ${port}`);
  });
}

// Vitest define NODE_ENV="test": no arranca el servidor al importar createApp.
if (process.env.NODE_ENV !== "test") {
  void main();
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd worker && npx vitest run test/server.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd .. && git add worker/server.ts worker/test/server.test.ts
git commit -m "feat(worker): servidor Express con POST /run-test y GET /health"
```

---

## Task 14: Gate de verificación integral

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Verificar el worker completo**

Run: `cd worker && npm run typecheck && npm test`
Expected: PASS — typecheck de todo el paquete y los 4 archivos de test (`adaptive-login`, `concurrency`, `sweep-orphan-runs`, `server`).

- [ ] **Step 2: Verificar la app Next.js completa**

Run: `cd .. && npm run typecheck && npm run lint && npm test && npm run build`
Expected: PASS — typecheck, lint, tests y build de producción.

- [ ] **Step 3: Si algo falla, corregir antes de continuar**

Los errores típicos: un import sin ajustar, o `@sparticuz/chromium` incompatible con `playwright-core` (afecta solo a la ejecución real, no al typecheck). Corregir el import o la versión y repetir Steps 1-2.

- [ ] **Step 4: Commit (solo si hubo correcciones)**

```bash
git add -A
git commit -m "fix: correcciones del gate de verificacion del refactor"
```

---

## Task 15: Limpieza de dependencias y archivos de deploy

**Files:**
- Modify: `package.json`
- Delete: `Dockerfile`, `railway.json`, `.dockerignore`
- Create: `render.yaml`

- [ ] **Step 1: Quitar dependencias muertas y el script `worker` de `package.json`**

En `package.json` raíz:
1. En `scripts`, eliminar la línea `"worker": "tsx --env-file=.env.local worker/index.ts"`.
2. En `dependencies`, eliminar `"bullmq"`, `"ioredis"` y `"@google/genai"`.
3. En `devDependencies`, eliminar `"playwright"`.

- [ ] **Step 2: Actualizar el lockfile de la raíz**

Run: `npm install`
Expected: actualiza `package-lock.json` quitando los paquetes eliminados.

- [ ] **Step 3: Borrar los archivos del deploy viejo del worker**

```bash
git rm Dockerfile railway.json .dockerignore
```

- [ ] **Step 4: Crear `render.yaml`**

```yaml
services:
  - type: web
    name: ai-testing-worker
    runtime: node
    plan: free
    rootDir: worker
    buildCommand: npm install
    startCommand: npm start
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

- [ ] **Step 5: Verificar la app Next.js**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: PASS — nada en la raíz importa `bullmq`, `ioredis`, `playwright` ni `@google/genai`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json render.yaml
git rm --cached Dockerfile railway.json .dockerignore 2>/dev/null; git commit -m "chore: quita deps de BullMQ/Playwright de la raiz y agrega render.yaml"
```

---

## Task 16: Documentación

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Modify: `docs/DEPLOY.md`
- Modify: `README.md`

- [ ] **Step 1: Reescribir `.env.example`**

Reemplazar todo el contenido por:

```
# === Vercel (frontend + API Routes) ===

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Worker en Render — la API Route lo contacta vía HTTP
WORKER_URL=https://<tu-worker>.onrender.com
WORKER_SECRET=

# === Worker (Render) ===
# Las variables del worker están en worker/.env.example
```

- [ ] **Step 2: Actualizar `CLAUDE.md`**

Aplicar estos cambios:
1. **Bloque "Arquitectura":** `worker/` ya no es un consumidor de BullMQ; es un servidor Express HTTP en Render. Actualizar el comentario que lo describe.
2. **Tabla "Stack":** eliminar la fila "Cola de jobs · BullMQ + Upstash Redis"; cambiar "Deploy worker · Railway" por "Deploy worker · Render". Añadir/ajustar una fila "Worker · Express HTTP".
3. **"Comandos principales":** eliminar la línea `npm run worker`.
4. **"Tablas en Supabase":** en la descripción de `test_runs`, quitar `retries` de la lista de columnas.
5. **"Variables de entorno":** quitar `UPSTASH_REDIS_URL` y `UPSTASH_REDIS_TOKEN`; añadir `WORKER_URL` y `WORKER_SECRET` (Vercel) y notar que `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_SECRET` viven en el worker (Render).
6. **Sección "Sistema de diseño y UI":** en el párrafo que empieza "La configuración del runner", quitar la mención a `retries`.
7. **"Roadmap" Fase 4:** reformular el título y los ítems para que describan el worker HTTP en vez de BullMQ/Redis (sin cola, llamada HTTP directa).
8. **"Reglas de seguridad" → "Ejecución de Playwright en el servidor":** reescribir la primera regla: Playwright nunca corre en una API Route de Vercel; corre en el worker de Render, y la API Route delega vía HTTP autenticada con `WORKER_SECRET`. El rate limit de 5/min se mantiene.

- [ ] **Step 3: Reescribir `docs/DEPLOY.md`**

Reescribir la guía para la arquitectura de dos servicios **Vercel + Render** (sin Upstash):
1. Encabezado: el worker es un servicio Express en Render free tier; Vercel lo contacta vía HTTP.
2. Eliminar por completo la sección "2. Upstash Redis".
3. Sección Gemini: la `GEMINI_API_KEY` vive en Render.
4. Sección Vercel: variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_URL`, `WORKER_SECRET`.
5. Reemplazar la sección "Railway (worker)" por "Render (worker)": *New → Blueprint* desde el repo, Render detecta `render.yaml`; variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `WORKER_SECRET`; notar que el free tier duerme tras 15 min (cold start ~30-50 s).
6. Checklist post-deploy: quitar el ítem de los 6 runs/Upstash si aplica; añadir verificar `GET {WORKER_URL}/health`.

- [ ] **Step 4: Actualizar `README.md`**

1. **Tabla "Stack":** quitar la fila "Cola de jobs · BullMQ sobre Upstash Redis"; cambiar "Deploy worker · Railway..." por "Deploy worker · Render (render.yaml)"; en "Tests" quitar la mención a mocks de BullMQ.
2. **Diagrama "Arquitectura":** reemplazar el bloque BullMQ/Upstash/Worker(Railway) por: API Route → `POST /run-test` → Worker Express (Render) → Gemini/Playwright/Storage.
3. **"Estructura del repo":** quitar `lib/queue/`, `lib/gemini/`, `lib/playwright/`, `lib/storage/` del árbol de `lib/`; actualizar el bloque `worker/` para listar `server.ts`, `process-test-run.ts`, `concurrency.ts`, `sweep-orphan-runs.ts`, `lib/`.
4. **"Setup local":** quitar `npx playwright install chromium`; notar que el worker se instala aparte con `cd worker && npm install`.
5. **"Comandos":** quitar `npm run worker`; añadir que el worker se corre con `cd worker && npm start`.
6. **"Despliegue":** cambiar "Upstash, Vercel y Railway" por "Vercel y Render".
7. La sección "Detalle: detección adaptativa de login" menciona `lib/playwright/adaptive-login.ts`: actualizar la ruta a `worker/lib/adaptive-login.ts`.

- [ ] **Step 5: Verificar que no quedan referencias muertas**

Run: `git grep -n -i -E "bullmq|upstash|ioredis|railway" -- "*.md" ".env.example"`
Expected: sin resultados (salvo, si acaso, menciones históricas intencionales en specs/plans antiguos de `docs/superpowers/`, que no se tocan).

- [ ] **Step 6: Commit**

```bash
git add .env.example CLAUDE.md docs/DEPLOY.md README.md
git commit -m "docs: actualiza arquitectura a Vercel + worker HTTP en Render"
```

---

## Self-Review (cubierto por este plan)

- **Spec §3-§5 (arquitectura, worker, flujo):** T3-T4 (lado Vercel), T7-T14 (paquete worker). ✓
- **Spec §6 (lado Vercel):** T3 (`trigger-worker`), T4 (route con `after()`), T6 (Zod sin `retries`), T6 (formulario). ✓
- **Spec §7 (migración):** T1. ✓
- **Spec §8 (inventario de archivos):** eliminar — T5, T7, T15; crear — T3, T7, T8, T9, T10, T13, T15; mover — T10, T11; modificar — T2, T4, T6, T12, T15, T16. ✓
- **Spec §9 (variables de entorno):** T7 (`worker/.env.example`), T16 (`.env.example`). ✓
- **Spec §10 (`render.yaml`):** T15. ✓
- **Spec §11 (tests):** T3, T4, T6, T8, T9, T13 con TDD; T10 mueve `adaptive-login.test.ts`; T14 gate. ✓
- **Decisión: barrido de runs huérfanos:** T9 (`sweep-orphan-runs.ts`) + T13 (`server.ts` lo llama en `main()`). ✓
- **Decisión: concurrencia 1:** T8. ✓
- **Tipos consistentes:** `triggerWorkerRun(testRunId: string)`, `enqueueExclusive(task)`, `sweepOrphanRuns(): Promise<number>`, `createApp()`, `launchBrowser(): Promise<Browser>`, `createSupabaseAdminClient()` — usados con la misma firma en todas las tareas. ✓
