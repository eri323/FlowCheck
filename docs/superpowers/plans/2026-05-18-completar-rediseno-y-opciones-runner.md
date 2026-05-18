# Completar el rediseño + opciones de runner — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el resto del prototipo `desing/` al dashboard y al flujo de pruebas, y conectar de verdad las opciones de runner (navegador, dispositivo, reintentos, captura de logs y errores JS).

**Architecture:** Se trabaja sobre el rediseño visual ya implementado. Primero el modelo de datos (migración `0005`), luego la cadena backend (validación Zod → API → cola → worker), después los componentes nuevos de UI y por último las 4 pantallas. Las pruebas backend usan Vitest con mocks manuales; las tareas de UI se verifican con `typecheck`/`lint`/`build`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4 (`@theme`), Supabase (Postgres + RLS + Realtime), BullMQ + Upstash Redis, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-18-completar-rediseno-y-opciones-runner-design.md`

**Convenciones del proyecto (obligatorias en cada tarea):**
- TypeScript strict, prohibido `any`, solo exports nombrados.
- Rutas de API validan con Zod antes de tocar la DB.
- Queries de Supabase manejan `{ data, error }` explícitamente.
- No hardcodear colores ni escalas `zinc-*`; usar los tokens semánticos.
- Mensajes y comentarios en español; nombres de variables en español como el código existente.

---

## Fase 1 — Modelo de datos

### Task 1: Migración `0005_runner_config.sql`

**Files:**
- Create: `supabase/migrations/0005_runner_config.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- =====================================================================
-- Configuración de runner — columnas para navegador, dispositivo,
-- reintentos, conteo de errores JS y stream de logs.
-- Para correr esta migración: pegar este archivo completo en el
-- SQL Editor del proyecto en Supabase y ejecutarlo.
-- =====================================================================

alter table public.test_runs
  add column browser text not null default 'chromium',
  add column device text not null default 'desktop',
  add column retries smallint not null default 1,
  add column js_error_count integer not null default 0,
  add column logs jsonb not null default '[]'::jsonb;

-- Acota los valores admitidos sin usar un enum (más fácil de extender).
alter table public.test_runs
  add constraint test_runs_browser_check
    check (browser in ('chromium', 'firefox', 'webkit')),
  add constraint test_runs_device_check
    check (device in ('desktop', 'mobile')),
  add constraint test_runs_retries_check
    check (retries between 0 and 5);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Pega el contenido completo del archivo en el SQL Editor del proyecto Supabase y ejecútalo. Verifica que no haya error y que `test_runs` tenga las 5 columnas nuevas (pestaña Table Editor → `test_runs`).

Esperado: las columnas `browser`, `device`, `retries`, `js_error_count`, `logs` existen. Las columnas nuevas heredan la RLS de `test_runs` automáticamente; no hay políticas que añadir. `test_runs` ya está en la publication `supabase_realtime` (migración `0004`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_runner_config.sql
git commit -m "feat(db): columnas de configuración de runner en test_runs"
```

---

## Fase 2 — Validación, API y cola

### Task 2: Extender el schema Zod con los campos de runner

**Files:**
- Modify: `lib/validation/test-run.ts` (bloque `baseFields`, líneas 100-104)
- Test: `tests/lib/validation/test-run.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añade este bloque `describe` al final de `tests/lib/validation/test-run.test.ts`:

```typescript
describe("createTestRunSchema — configuración de runner", () => {
  it("aplica los defaults de runner cuando no se envían", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.browser).toBe("chromium");
      expect(result.data.device).toBe("desktop");
      expect(result.data.retries).toBe(1);
    }
  });

  it("acepta device 'mobile' y un número de reintentos válido", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      browser: "chromium",
      device: "mobile",
      retries: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un navegador distinto de chromium en este ciclo", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      browser: "firefox",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un número de reintentos fuera de rango", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      retries: 9,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npm test -- tests/lib/validation/test-run.test.ts`
Expected: FAIL — los 4 nuevos tests fallan (los campos no existen aún en el schema).

- [ ] **Step 3: Añadir los campos al schema**

En `lib/validation/test-run.ts`, reemplaza el bloque `baseFields` (líneas 100-104):

```typescript
const baseFields = {
  target_url: httpUrlSchema,
  prompt: extraPromptSchema,
  project_id: z.uuid().optional(),
  // Este ciclo solo Chromium es ejecutable; la columna de DB admite los 3.
  browser: z.literal("chromium").default("chromium"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  retries: z.number().int().min(0).max(5).default(1),
};
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm test -- tests/lib/validation/test-run.test.ts`
Expected: PASS — los 11 tests del archivo pasan.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/test-run.ts tests/lib/validation/test-run.test.ts
git commit -m "feat(validation): campos browser/device/retries en createTestRunSchema"
```

---

### Task 3: Persistir los campos de runner en la API y pasarlos a la cola

**Files:**
- Modify: `lib/queue/test-run-queue.ts:27-30` (`enqueueTestRun`)
- Modify: `app/api/test-runs/route.ts:78-103` (insert + enqueue)
- Test: `tests/api/test-runs.test.ts`

- [ ] **Step 1: Añadir el parámetro `attempts` a `enqueueTestRun`**

En `lib/queue/test-run-queue.ts`, reemplaza la función `enqueueTestRun` (líneas 27-30):

```typescript
export async function enqueueTestRun(
  data: TestRunJobData,
  attempts = 3,
): Promise<void> {
  const queue = getTestRunQueue();
  await queue.add("process", data, { jobId: data.testRunId, attempts });
}
```

- [ ] **Step 2: Escribir los tests que fallan**

En `tests/api/test-runs.test.ts`, primero extiende el mock para capturar los `insert`. En `makeSupabaseMock`, añade un array `inserts` junto a `updates`:

```typescript
type SupabaseMock = {
  client: unknown;
  updates: Array<Record<string, unknown>>;
  inserts: Array<Record<string, unknown>>;
};

function makeSupabaseMock(opts: SupabaseMockOptions): SupabaseMock {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
```

Cambia `builder.insert` para capturar el payload:

```typescript
      builder.insert = vi.fn((payload: Record<string, unknown>) => {
        mode = "insert";
        inserts.push(payload);
        return builder;
      });
```

Y el `return` final de `makeSupabaseMock`:

```typescript
  return { client, updates, inserts };
```

Luego añade este test dentro del `describe("POST /api/test-runs")`:

```typescript
it("persiste los campos de runner y deriva attempts de retries", async () => {
  const { POST, createSupabaseServerClient, enqueueTestRun } = await loadRoute();
  const { client, inserts } = makeSupabaseMock({
    user: { id: "u1" },
    recentCount: 0,
    insertData: { id: "run-r" },
  });
  createSupabaseServerClient.mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
  );
  enqueueTestRun.mockResolvedValue(undefined);

  const response = await POST(
    makeRequest({ ...validBody, device: "mobile", retries: 2 }),
  );
  expect(response.status).toBe(201);
  expect(inserts).toHaveLength(1);
  expect(inserts[0]).toMatchObject({
    browser: "chromium",
    device: "mobile",
    retries: 2,
  });
  // retries=2 → 3 intentos totales (el inicial + 2 reintentos).
  expect(enqueueTestRun).toHaveBeenCalledWith(
    { testRunId: "run-r", userId: "u1" },
    3,
  );
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- tests/api/test-runs.test.ts`
Expected: FAIL — el nuevo test falla (la ruta aún no inserta los campos ni pasa `attempts`).

- [ ] **Step 4: Actualizar la ruta de API**

En `app/api/test-runs/route.ts`, reemplaza el bloque del insert (líneas 78-90):

```typescript
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
      retries: input.retries,
      status: "pendiente",
    })
    .select("id")
    .single();
```

Y reemplaza la llamada a `enqueueTestRun` (línea 103):

```typescript
    await enqueueTestRun(
      { testRunId: testRun.id, userId: user.id },
      input.retries + 1,
    );
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npm test -- tests/api/test-runs.test.ts`
Expected: PASS — los 8 tests del archivo pasan.

- [ ] **Step 6: Commit**

```bash
git add lib/queue/test-run-queue.ts app/api/test-runs/route.ts tests/api/test-runs.test.ts
git commit -m "feat(api): persiste config de runner y deriva attempts de retries"
```

---

## Fase 3 — Worker

> Las tareas del worker no tienen tests unitarios (requieren un navegador real; el proyecto no testea el worker). Se verifican con `npm run typecheck` y `npm run lint`. La verificación funcional end-to-end es manual y se hace al final, en la Task 17.

### Task 4: Pasar `device` al ejecutor desde el worker

**Files:**
- Modify: `worker/process-test-run.ts:11-19` (tipo `TestRunRow`), `:170` (select), `:207-211` (llamada a `executeTestRun`)

- [ ] **Step 1: Añadir `device` al tipo y al select**

En `worker/process-test-run.ts`, reemplaza el tipo `TestRunRow` (líneas 11-19):

```typescript
type TestRunRow = {
  id: string;
  user_id: string;
  target_url: string;
  prompt: string | null;
  status: string;
  test_type: TestType;
  test_data: Record<string, unknown>;
  device: "desktop" | "mobile";
};
```

Reemplaza el select de `processTestRun` (línea 170):

```typescript
    .select(
      "id, user_id, target_url, prompt, status, test_type, test_data, device",
    )
```

- [ ] **Step 2: Pasar `device` a `executeTestRun`**

En `worker/process-test-run.ts`, reemplaza la llamada a `executeTestRun` (líneas 207-211):

```typescript
    const finalStatus = await withTimeout(
      executeTestRun(supabase, testRunId, testRun.test_type, testRun.device),
      EXECUTION_TIMEOUT_MS,
      "Ejecución del plan con Playwright",
    );
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run typecheck`
Expected: FAIL — `executeTestRun` aún no acepta el 4º parámetro. Se corrige en la Task 5; este fallo es esperado y se resuelve dentro de la misma fase.

- [ ] **Step 4: Commit**

```bash
git add worker/process-test-run.ts
git commit -m "feat(worker): lee device del test_run y lo pasa al ejecutor"
```

### Task 5: Emulación de dispositivo en el ejecutor de Playwright

**Files:**
- Modify: `lib/playwright/execute-test-run.ts` (imports, firma de `runCase`, firma de `executeTestRun`)

- [ ] **Step 1: Importar `devices` de Playwright**

En `lib/playwright/execute-test-run.ts`, reemplaza la línea 1:

```typescript
import {
  chromium,
  devices,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "playwright";
```

- [ ] **Step 2: Aceptar opciones de contexto en `runCase`**

En `lib/playwright/execute-test-run.ts`, reemplaza la firma de `runCase` (líneas 246-252) y la creación del contexto (línea 258):

```typescript
async function runCase(
  supabase: SupabaseClient,
  testRunId: string,
  testCase: CaseRow,
  browser: Browser,
  testType: TestType | undefined,
  contextOptions: BrowserContextOptions,
): Promise<"completado" | "fallido"> {
  await supabase
    .from("test_cases")
    .update({ status: "corriendo" })
    .eq("id", testCase.id);

  const context = await browser.newContext(contextOptions);
```

- [ ] **Step 3: Resolver el descriptor de dispositivo en `executeTestRun`**

En `lib/playwright/execute-test-run.ts`, reemplaza la función `executeTestRun` (líneas 341-361):

```typescript
export async function executeTestRun(
  supabase: SupabaseClient,
  testRunId: string,
  testType?: TestType,
  device: "desktop" | "mobile" = "desktop",
): Promise<"completado" | "fallido"> {
  const cases = await loadCasesForRun(supabase, testRunId);

  // 'Pixel 5' aporta viewport, userAgent y isMobile; desktop usa el default.
  const contextOptions: BrowserContextOptions =
    device === "mobile" ? devices["Pixel 5"] : {};

  const browser = await chromium.launch({ headless: true });
  let anyFailed = false;

  try {
    for (const testCase of cases) {
      const result = await runCase(
        supabase,
        testRunId,
        testCase,
        browser,
        testType,
        contextOptions,
      );
      if (result === "fallido") anyFailed = true;
    }
  } finally {
    await browser.close();
  }

  return anyFailed ? "fallido" : "completado";
}
```

- [ ] **Step 4: Verificar typecheck y lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS — el fallo de la Task 4 queda resuelto.

- [ ] **Step 5: Commit**

```bash
git add lib/playwright/execute-test-run.ts
git commit -m "feat(worker): emulación de dispositivo móvil en el ejecutor"
```

### Task 6: Captura de logs y de errores JS en el ejecutor

**Files:**
- Modify: `lib/playwright/execute-test-run.ts` (helper de logs, listeners en `runCase`, escritura en `executeTestRun`)

- [ ] **Step 1: Añadir el tipo y el acumulador de logs**

En `lib/playwright/execute-test-run.ts`, después de la constante `STEP_TIMEOUT_MS` (línea 48), añade:

```typescript
type LogLevel = "info" | "ok" | "warn" | "err";
type LogEntry = { ts: string; level: LogLevel; msg: string };

/** Acumula el stream de logs de un run y lo vuelca a test_runs.logs. */
class RunLog {
  private readonly entries: LogEntry[] = [];

  add(level: LogLevel, msg: string): void {
    this.entries.push({ ts: new Date().toISOString(), level, msg });
  }

  get all(): LogEntry[] {
    return this.entries;
  }

  async flush(supabase: SupabaseClient, testRunId: string): Promise<void> {
    const { error } = await supabase
      .from("test_runs")
      .update({ logs: this.entries })
      .eq("id", testRunId);
    if (error) {
      console.warn(`No se pudo volcar logs del run ${testRunId}: ${error.message}`);
    }
  }
}
```

- [ ] **Step 2: Pasar el log y el contador de errores a `runCase`**

En `lib/playwright/execute-test-run.ts`, reemplaza la firma de `runCase` (que tras la Task 5 termina en `contextOptions: BrowserContextOptions,`) añadiendo dos parámetros, y registra los listeners de error JS tras crear la página. Reemplaza el bloque desde la firma hasta `const page = await context.newPage();` y la línea siguiente:

```typescript
async function runCase(
  supabase: SupabaseClient,
  testRunId: string,
  testCase: CaseRow,
  browser: Browser,
  testType: TestType | undefined,
  contextOptions: BrowserContextOptions,
  log: RunLog,
  jsErrors: { count: number },
): Promise<"completado" | "fallido"> {
  await supabase
    .from("test_cases")
    .update({ status: "corriendo" })
    .eq("id", testCase.id);

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Errores JS de la página: excepciones no capturadas y console.error.
  page.on("pageerror", (error) => {
    jsErrors.count += 1;
    log.add("err", `js error: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      jsErrors.count += 1;
      log.add("err", `console.error: ${msg.text().slice(0, 200)}`);
    }
  });

  log.add("info", `caso "${testCase.name}" — ${testCase.steps.length} pasos`);
```

- [ ] **Step 3: Registrar y volcar logs por paso**

En `lib/playwright/execute-test-run.ts`, dentro de `runCase`, justo después del `await supabase.from("test_steps").update(update).eq("id", step.id);` (línea ~326), añade el registro del paso y el volcado:

```typescript
      await supabase.from("test_steps").update(update).eq("id", step.id);

      log.add(
        errorMessage ? "err" : "ok",
        `paso ${step.position + 1} · ${step.action} · ${stepStatus}` +
          (errorMessage ? ` — ${errorMessage}` : ` · ${durationMs}ms`),
      );
      await log.flush(supabase, testRunId);
```

- [ ] **Step 4: Crear el log y el contador en `executeTestRun` y persistir el conteo**

En `lib/playwright/execute-test-run.ts`, reemplaza el cuerpo de `executeTestRun` (la función completa tras la Task 5):

```typescript
export async function executeTestRun(
  supabase: SupabaseClient,
  testRunId: string,
  testType?: TestType,
  device: "desktop" | "mobile" = "desktop",
): Promise<"completado" | "fallido"> {
  const cases = await loadCasesForRun(supabase, testRunId);

  const contextOptions: BrowserContextOptions =
    device === "mobile" ? devices["Pixel 5"] : {};

  const log = new RunLog();
  const jsErrors = { count: 0 };
  log.add("info", `ejecución iniciada · device=${device} · ${cases.length} casos`);
  await log.flush(supabase, testRunId);

  const browser = await chromium.launch({ headless: true });
  log.add("ok", "navegador lanzado · chromium · headless");
  let anyFailed = false;

  try {
    for (const testCase of cases) {
      const result = await runCase(
        supabase,
        testRunId,
        testCase,
        browser,
        testType,
        contextOptions,
        log,
        jsErrors,
      );
      if (result === "fallido") anyFailed = true;
    }
  } finally {
    await browser.close();
  }

  const finalStatus = anyFailed ? "fallido" : "completado";
  log.add(
    anyFailed ? "err" : "ok",
    `ejecución finalizada · estado=${finalStatus} · errores JS=${jsErrors.count}`,
  );
  await supabase
    .from("test_runs")
    .update({ logs: log.all, js_error_count: jsErrors.count })
    .eq("id", testRunId);

  return finalStatus;
}
```

El getter `all` de `RunLog` ya quedó definido en el Step 1 de esta tarea.

- [ ] **Step 5: Verificar typecheck y lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/playwright/execute-test-run.ts
git commit -m "feat(worker): captura stream de logs y conteo de errores JS"
```

---

## Fase 4 — Componentes nuevos de UI

### Task 7: Componente `Sparkline`

**Files:**
- Create: `components/ui/sparkline.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
type SparklineProps = {
  data: number[];
  className?: string;
  width?: number;
  height?: number;
};

/**
 * Mini-gráfico de tendencia. Dibuja una polilínea + área sobre datos reales.
 * Si hay menos de 2 puntos no renderiza nada (el llamador decide el fallback).
 */
export function Sparkline({
  data,
  className,
  width = 120,
  height = 32,
}: SparklineProps): React.JSX.Element | null {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = points.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const gradientId = `spark-${data.length}-${Math.round(max)}`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Verificar typecheck y lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ui/sparkline.tsx
git commit -m "feat(ui): componente Sparkline"
```

### Task 8: Componente `Kbd` e iconos nuevos

**Files:**
- Create: `components/ui/kbd.tsx`
- Modify: `components/ui/icons.tsx` (añadir `Bell`, `Bolt` ya existe, `Refresh`)

- [ ] **Step 1: Crear el componente `Kbd`**

```tsx
import { cn } from "@/lib/cn";

/** Pista visual de atajo de teclado. Decorativa: no captura eventos. */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <kbd
      className={cn(
        "inline-flex items-center gap-1 rounded border border-border border-b-2 bg-surface-2 px-1.5 py-0.5",
        "font-mono text-[0.6875rem] text-faint",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
```

- [ ] **Step 2: Añadir los iconos `Bell` y `Refresh`**

En `components/ui/icons.tsx`, al final del archivo, añade:

```tsx
export const Bell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z" />
    <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
  </Icon>
);

export const Refresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 0 1 14.3-6.2L21 8.5" />
    <path d="M21 4v4.5h-4.5" />
    <path d="M20.5 12a8.5 8.5 0 0 1-14.3 6.2L3 15.5" />
    <path d="M3 20v-4.5h4.5" />
  </Icon>
);
```

- [ ] **Step 3: Verificar typecheck y lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ui/kbd.tsx components/ui/icons.tsx
git commit -m "feat(ui): componente Kbd e iconos Bell/Refresh"
```

---

## Fase 5 — Shell

### Task 9: Delta del sidebar

**Files:**
- Modify: `app/dashboard/_components/sidebar-nav.tsx`

Estado actual: `Logo`, botón "Nuevo test run", sección "Panel" con 2 ítems, pie con texto. Objetivo: añadir ítem "En vivo" con punto de pulso, contadores por ítem, sección "Cuenta" con 2 ítems deshabilitados, y un medidor de uso placeholder.

- [ ] **Step 1: Reescribir el componente completo**

Reemplaza todo el contenido de `app/dashboard/_components/sidebar-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { buttonVariants } from "@/components/ui/button";
import { Grid, Plus, Runs, Bolt, Settings, Api } from "@/components/ui/icons";

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

type NavItem = {
  label: string;
  href: string;
  icon: IconComponent;
  live?: boolean;
};

const PANEL: NavItem[] = [
  { label: "Resumen", href: "/dashboard", icon: Grid },
  { label: "Test runs", href: "/dashboard/runs", icon: Runs },
  { label: "En vivo", href: "/dashboard/runs", icon: Bolt, live: true },
];

const CUENTA: { label: string; icon: IconComponent }[] = [
  { label: "API & webhooks", icon: Api },
  { label: "Configuración", icon: Settings },
];

export function SidebarNav({
  onNavigate,
  runsCount = 0,
  activeCount = 0,
}: {
  onNavigate?: () => void;
  runsCount?: number;
  activeCount?: number;
}): React.JSX.Element {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/runs") {
      return (
        pathname.startsWith("/dashboard/runs") &&
        pathname !== "/dashboard/runs/new"
      );
    }
    return false;
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="px-2 py-3">
        <Logo />
      </div>

      <Link
        href="/dashboard/runs/new"
        onClick={onNavigate}
        className={cn(buttonVariants(), "mt-2 w-full")}
      >
        <Plus size={16} />
        Nuevo test run
      </Link>

      <nav className="mt-5 flex flex-col gap-0.5">
        <p className="px-2 pb-1.5 pt-3.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
          Panel
        </p>
        {PANEL.map((item) => {
          const Icon = item.icon;
          const active = !item.live && isActive(item.href);
          const count = item.live ? activeCount : runsCount;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150",
                active
                  ? "border border-border bg-surface-2 font-medium text-text"
                  : "border border-transparent text-muted hover:bg-surface hover:text-text",
              )}
            >
              <Icon
                size={16}
                className={active ? "text-accent" : "text-faint"}
              />
              <span className="flex-1">{item.label}</span>
              {item.label !== "Resumen" && count > 0 ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 font-mono text-[0.625rem]",
                    item.live
                      ? "border-accent-subtle bg-accent-subtle text-accent-text"
                      : "border-border bg-surface-2 text-faint",
                  )}
                >
                  {item.live ? (
                    <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
                  ) : null}
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}

        <p className="px-2 pb-1.5 pt-4 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
          Cuenta
        </p>
        {CUENTA.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              aria-disabled="true"
              title="Próximamente"
              className="flex cursor-not-allowed items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-sm text-faint opacity-60"
            >
              <Icon size={16} className="text-faint" />
              <span className="flex-1">{item.label}</span>
              <span className="rounded-full border border-border bg-surface-2 px-1.5 font-mono text-[0.5625rem] uppercase tracking-wide text-faint">
                pronto
              </span>
            </span>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 px-2.5 pt-4">
        <div className="flex items-center justify-between font-mono text-[0.625rem] text-faint">
          <span>Uso del mes</span>
          <span className="text-muted">— / —</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-0 rounded-full bg-accent" />
        </div>
        <p className="font-mono text-[0.625rem] text-faint">
          Probe · entorno de demostración
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Añadir los iconos `Settings` y `Api`**

En `components/ui/icons.tsx`, al final del archivo, añade:

```tsx
export const Settings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6" />
  </Icon>
);

export const Api = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h7M4 12h10M4 17h7" />
    <circle cx="17.5" cy="7" r="2" />
    <circle cx="19.5" cy="12" r="2" />
    <circle cx="17.5" cy="17" r="2" />
  </Icon>
);
```

- [ ] **Step 3: Verificar typecheck, lint y build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/_components/sidebar-nav.tsx components/ui/icons.tsx
git commit -m "feat(dashboard): sidebar con 'En vivo', sección Cuenta y medidor de uso"
```

> Nota: `SidebarNav` ahora acepta `runsCount`/`activeCount` opcionales con default 0. `DashboardShell` lo seguirá invocando sin props (los contadores quedan en 0 hasta una iteración futura que los cablee desde el layout; no es bloqueante para esta tarea).

### Task 10: Delta del topbar

**Files:**
- Modify: `app/dashboard/_components/topbar.tsx`

- [ ] **Step 1: Añadir `⌘K` decorativo y campana deshabilitada**

En `app/dashboard/_components/topbar.tsx`, reemplaza el `import` de iconos (línea 6) y el bloque de acciones de la derecha (líneas 61-64).

Import:

```tsx
import { Menu, Bell } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
```

Bloque de acciones (reemplaza el `<div className="flex items-center gap-1">…</div>`):

```tsx
      <div className="flex items-center gap-1.5">
        <Kbd className="hidden sm:inline-flex">⌘ K</Kbd>
        <button
          type="button"
          aria-disabled="true"
          title="Próximamente"
          className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-md text-faint opacity-60"
        >
          <Bell size={16} />
        </button>
        <ThemeToggle />
        <UserMenu email={userEmail} />
      </div>
```

- [ ] **Step 2: Verificar typecheck, lint y build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/_components/topbar.tsx
git commit -m "feat(dashboard): topbar con atajo ⌘K y campana"
```

---

## Fase 6 — Pantallas

### Task 11: Resumen — saludo, sparklines y tarjeta de cola

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/ui/stat-tile.tsx`

- [ ] **Step 1: Extender `StatTile` para aceptar una sparkline opcional**

En `components/ui/stat-tile.tsx`, reemplaza todo el contenido:

```tsx
import { cn } from "@/lib/cn";
import { Sparkline } from "./sparkline";

export type StatTone = "accent" | "success" | "danger" | "running";

const DOT: Record<StatTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  running: "bg-running",
};

export function StatTile({
  label,
  value,
  unit,
  tone,
  trend,
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone: StatTone;
  trend?: number[];
}): React.JSX.Element {
  return (
    <div className="relative flex flex-col gap-2 overflow-hidden bg-surface px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", DOT[tone])} />
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
          {label}
        </span>
      </div>
      <p className="tabular text-[1.75rem] font-semibold leading-none tracking-tight text-text">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-medium text-faint">{unit}</span>
        ) : null}
      </p>
      {trend && trend.length >= 2 ? (
        <Sparkline
          data={trend}
          className="pointer-events-none absolute bottom-0 right-0 h-2/3 w-1/2 opacity-60"
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Calcular tendencias reales y el saludo en `page.tsx`**

En `app/dashboard/page.tsx`, después de la línea que define `recent` (línea 39), añade el cálculo de tendencias y el saludo. Inserta:

```tsx
  // Tendencia real: runs por día de los últimos 7 días naturales.
  const dayKey = (iso: string): string => iso.slice(0, 10);
  const today = new Date();
  const last7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().slice(0, 10));
  }
  const runsByDay = last7.map(
    (day) => rows.filter((r) => dayKey(r.created_at) === day).length,
  );

  const { data: userData } = await supabase.auth.getUser();
  const emailLocal = userData.user?.email?.split("@")[0] ?? "";
  const hour = today.getHours();
  const saludo =
    hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
```

- [ ] **Step 3: Usar el saludo en el encabezado y pasar `trend` a los tiles**

En `app/dashboard/page.tsx`, reemplaza el `<PageHeader …>` (líneas 56-67) por:

```tsx
      <div>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-accent-text">
          Resumen · hoy
        </p>
        <PageHeader
          title={emailLocal ? `${saludo}, ${emailLocal}.` : `${saludo}.`}
          description="El estado de tus pruebas automatizadas de un vistazo."
        >
          <Link
            href="/dashboard/runs/new"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus size={15} />
            Nuevo test run
          </Link>
        </PageHeader>
      </div>
```

Y reemplaza el bloque de los 4 `StatTile` (líneas 90-99) por:

```tsx
              <StatTile
                label="Total de runs"
                value={stats.total}
                tone="accent"
                trend={runsByDay}
              />
              <StatTile
                label="Completados"
                value={stats.completados}
                tone="success"
              />
              <StatTile label="Fallidos" value={stats.fallidos} tone="danger" />
              <StatTile label="En curso" value={stats.activos} tone="running" />
```

- [ ] **Step 4: Añadir la tarjeta "Próximas tareas" deshabilitada**

En `app/dashboard/page.tsx`, dentro de la `<section>` derecha (la del breakdown), después del `</div>` que cierra el `rounded-lg` del breakdown (línea 148), añade dentro de la misma `<section>`:

```tsx
              <div className="mt-4 rounded-lg border border-dashed border-border bg-surface px-5 py-6 text-center opacity-70">
                <p className="text-sm font-medium text-muted">
                  Próximas tareas
                </p>
                <p className="mt-1 text-xs text-faint">
                  La cola de ejecuciones programadas estará disponible pronto.
                </p>
              </div>
```

- [ ] **Step 5: Verificar typecheck, lint y build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx components/ui/stat-tile.tsx
git commit -m "feat(dashboard): saludo, sparklines reales y tarjeta de cola en Resumen"
```

### Task 12: Lista de runs — tabla y botones deshabilitados

**Files:**
- Modify: `app/dashboard/runs/_components/runs-table.tsx`

Objetivo: añadir los botones "Más filtros" y "Export" deshabilitados a la fila de filtros. La lista de filas ya tiene el lenguaje visual correcto (grid con cabecera); se conserva. No se reestructura a `<table>` HTML — el grid actual ya cumple el diseño y es responsive; reescribirlo a `<table>` arriesgaría regresiones sin ganancia visual.

- [ ] **Step 1: Añadir los botones deshabilitados a la barra de filtros**

En `app/dashboard/runs/_components/runs-table.tsx`, reemplaza el `import` de iconos (línea 9):

```tsx
import { Filter, Search, Download } from "@/components/ui/icons";
```

Reemplaza el `<div className="flex gap-2.5 sm:ml-auto">…</div>` (líneas 83-97) por:

```tsx
          <div className="flex gap-2.5 sm:ml-auto">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Filtrar por tipo"
              className="sm:w-40"
            >
              <option value="todos">Todos los tipos</option>
              {TEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TEST_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <button
              type="button"
              aria-disabled="true"
              title="Próximamente"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-faint opacity-60"
            >
              <Filter size={13} />
              Más filtros
            </button>
            <button
              type="button"
              aria-disabled="true"
              title="Próximamente"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-faint opacity-60"
            >
              <Download size={13} />
              Export
            </button>
          </div>
```

- [ ] **Step 2: Añadir el icono `Download`**

En `components/ui/icons.tsx`, al final del archivo, añade:

```tsx
export const Download = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5v11" />
    <path d="M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4.5 20h15" />
  </Icon>
);
```

- [ ] **Step 3: Verificar typecheck, lint y build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/runs/_components/runs-table.tsx components/ui/icons.tsx
git commit -m "feat(dashboard): botones Más filtros y Export en la lista de runs"
```

### Task 13: Nuevo run — sección "Configuración del runner"

**Files:**
- Modify: `app/dashboard/runs/new/_components/new-test-run-form.tsx`

Objetivo: añadir estado para `device` y `retries`, una nueva `FormSection` "Configuración del runner" antes del footer, los badges estáticos de detección de URL bajo el campo URL, y los botones deshabilitados del footer. El payload incluye `browser`/`device`/`retries`.

- [ ] **Step 1: Añadir estado de runner y los iconos**

En `new-test-run-form.tsx`, reemplaza el `import` de iconos (líneas 14-23) añadiendo `Eye`:

```tsx
import {
  AlertCircle,
  Bolt,
  Cursor,
  Eye,
  Globe,
  Pencil,
  Search,
  Shield,
  Terminal,
} from "@/components/ui/icons";
```

Después de `const [testType, setTestType] = useState<TestType>("login");` (línea 88), añade:

```tsx
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [retries, setRetries] = useState(1);
```

- [ ] **Step 2: Incluir los campos de runner en el payload**

En `new-test-run-form.tsx`, reemplaza la línea de `base` dentro de `buildPayload` (línea 110):

```tsx
    const base = {
      target_url: targetUrl,
      prompt: extraPrompt || undefined,
      browser: "chromium" as const,
      device,
      retries,
    };
```

- [ ] **Step 3: Añadir los badges estáticos de detección bajo el campo URL**

En `new-test-run-form.tsx`, dentro de la `FormSection` "URL objetivo", después del `</Field>` que cierra el campo URL (línea 201), antes del `</FormSection>`, añade:

```tsx
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[0.625rem] uppercase tracking-widest text-faint">
              detección:
            </span>
            {["https", "200 OK", "react · vite"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[0.625rem] text-faint opacity-70"
              >
                {tag}
              </span>
            ))}
            <span className="font-mono text-[0.5625rem] text-faint opacity-60">
              (vista previa)
            </span>
          </div>
```

- [ ] **Step 4: Añadir la sección "Configuración del runner"**

En `new-test-run-form.tsx`, después de la `FormSection` "Instrucción adicional" (cierra en línea 480) y antes del `<div className="bg-surface-2 px-5 py-4 sm:px-6">` del footer (línea 482), añade:

```tsx
        <FormSection
          title="Configuración del runner"
          description="Por defecto: Chromium, escritorio, headless, 1 reintento."
          step="05"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[0.625rem] uppercase tracking-widest text-faint">
                Navegador
              </span>
              <div className="flex gap-1.5">
                <span className="inline-flex items-center rounded-md border border-accent-subtle bg-accent-subtle px-2.5 py-1.5 text-xs font-medium text-accent-text">
                  Chromium
                </span>
                {["Firefox", "WebKit"].map((b) => (
                  <span
                    key={b}
                    title="Próximamente"
                    className="inline-flex cursor-not-allowed items-center rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-faint opacity-60"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[0.625rem] uppercase tracking-widest text-faint">
                Dispositivo
              </span>
              <div className="flex gap-0.5 rounded-md border border-border bg-surface-2 p-0.5">
                {(["desktop", "mobile"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={
                      device === d
                        ? "flex-1 rounded bg-elevated px-2 py-1 text-xs font-medium text-text shadow-e1"
                        : "flex-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:text-text"
                    }
                  >
                    {d === "desktop" ? "Desktop" : "Mobile"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[0.625rem] uppercase tracking-widest text-faint">
                Reintentos
              </span>
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2">
                <button
                  type="button"
                  aria-label="Menos reintentos"
                  onClick={() => setRetries((r) => Math.max(0, r - 1))}
                  className="px-3 py-1.5 text-muted transition-colors hover:text-text"
                >
                  −
                </button>
                <span className="tabular flex-1 text-center font-mono text-sm text-text">
                  {retries}
                </span>
                <button
                  type="button"
                  aria-label="Más reintentos"
                  onClick={() => setRetries((r) => Math.min(5, r + 1))}
                  className="px-3 py-1.5 text-muted transition-colors hover:text-text"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div
            className="mt-4 flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2.5"
            title="El worker corre en un servidor sin pantalla: siempre headless."
          >
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <Eye size={14} />
              Modo headless
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-faint">
              fijo
              <span className="relative h-3.5 w-6 rounded-full bg-accent">
                <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-white" />
              </span>
            </span>
          </div>
        </FormSection>
```

- [ ] **Step 5: Añadir los botones deshabilitados al footer**

En `new-test-run-form.tsx`, reemplaza el `<div className="flex flex-wrap items-center justify-between gap-3">` del footer (líneas 489-497) por:

```tsx
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              La IA generará el plan y el worker lo ejecutará en un navegador
              real.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-disabled="true"
                title="Próximamente"
                className="cursor-not-allowed rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-faint opacity-60"
              >
                Guardar como plantilla
              </button>
              <button
                type="button"
                aria-disabled="true"
                title="Próximamente"
                className="cursor-not-allowed rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-faint opacity-60"
              >
                Ejecución programada
              </button>
              <Button type="submit" loading={isPending}>
                {isPending ? "Creando" : "Generar y ejecutar"}
              </Button>
            </div>
          </div>
```

- [ ] **Step 6: Verificar typecheck, lint y build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/runs/new/_components/new-test-run-form.tsx
git commit -m "feat(dashboard): sección Configuración del runner en Nuevo run"
```

### Task 14: Detalle — pestañas y modo en vivo

**Files:**
- Modify: `app/dashboard/runs/[id]/page.tsx` (select de `test_runs`, tipos)
- Modify: `app/dashboard/runs/[id]/_components/test-run-detail.tsx`

Objetivo: el detalle lee `logs` y `js_error_count`; el componente cliente añade pestañas (Pasos / Logs / Screenshots / Network) en modo final y un panel de logs en vivo en modo activo. Toda la lógica de Realtime, `refetch()`, `caseIdsRef`, el intervalo de 3s y el lightbox se conserva.

- [ ] **Step 1: Añadir `logs` y `js_error_count` al select y los tipos del server component**

En `app/dashboard/runs/[id]/page.tsx`, reemplaza el tipo `TestRunRow` (líneas 13-23) añadiendo los dos campos:

```tsx
type LogEntry = { ts: string; level: string; msg: string };

type TestRunRow = {
  id: string;
  target_url: string;
  prompt: string | null;
  status: string;
  test_type: TestType;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  logs: LogEntry[];
  js_error_count: number;
};
```

Reemplaza el select de `test_runs` (líneas 58-60):

```tsx
    .select(
      "id, target_url, prompt, status, test_type, error_message, started_at, finished_at, created_at, logs, js_error_count",
    )
```

- [ ] **Step 2: Reescribir `test-run-detail.tsx` con pestañas y panel de logs**

Reemplaza todo el contenido de `app/dashboard/runs/[id]/_components/test-run-detail.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import {
  AlertCircle,
  Close,
  ImageIcon,
  Sparkles,
} from "@/components/ui/icons";
import { RunStatusBadge, StepStatusBadge } from "@/components/runs/run-status";
import { StepTimeline } from "@/components/runs/step-timeline";

type LogEntry = { ts: string; level: string; msg: string };

type TestRun = {
  id: string;
  status: string;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  logs: LogEntry[];
  js_error_count: number;
};

type TestCase = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  status: string;
};

type TestStep = {
  id: string;
  test_case_id: string;
  position: number;
  action: string;
  selector: string | null;
  value: string | null;
  status: string;
  error_message: string | null;
  screenshot_url: string | null;
  duration_ms: number | null;
};

type Props = {
  runId: string;
  initialRun: TestRun;
  initialCases: TestCase[];
  initialSteps: TestStep[];
};

const LOG_LEVEL_CLASS: Record<string, string> = {
  ok: "text-success-text",
  err: "text-danger-text",
  warn: "text-warning-text",
  info: "text-muted",
};

export function TestRunDetail({
  runId,
  initialRun,
  initialCases,
  initialSteps,
}: Props): React.JSX.Element {
  const [run, setRun] = useState<TestRun>(initialRun);
  const [cases, setCases] = useState<TestCase[]>(initialCases);
  const [steps, setSteps] = useState<TestStep[]>(initialSteps);
  const [openScreenshot, setOpenScreenshot] = useState<string | null>(null);
  const [tab, setTab] = useState("pasos");

  const caseIdsRef = useRef<Set<string>>(new Set(initialCases.map((c) => c.id)));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`test_run_${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            setRun((prev) => ({ ...prev, ...(payload.new as Partial<TestRun>) }));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_cases",
          filter: `test_run_id=eq.${runId}`,
        },
        (payload) => {
          const row = payload.new as TestCase | undefined;
          if (!row) return;
          caseIdsRef.current.add(row.id);
          setCases((prev) => {
            const exists = prev.some((c) => c.id === row.id);
            if (exists) {
              return prev.map((c) => (c.id === row.id ? { ...c, ...row } : c));
            }
            return [...prev, row].sort((a, b) => a.position - b.position);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_steps",
        },
        (payload) => {
          const row = payload.new as TestStep | undefined;
          if (!row || !caseIdsRef.current.has(row.test_case_id)) return;
          setSteps((prev) => {
            const exists = prev.some((s) => s.id === row.id);
            if (exists) {
              return prev.map((s) => (s.id === row.id ? { ...s, ...row } : s));
            }
            return [...prev, row];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  // Reconciliación: Realtime solo entrega eventos a partir de SUBSCRIBED.
  // refetch() relee el estado autoritativo y repuebla caseIdsRef.
  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();

    const [{ data: freshRun }, { data: freshCases }] = await Promise.all([
      supabase
        .from("test_runs")
        .select(
          "id, status, error_message, started_at, finished_at, created_at, logs, js_error_count",
        )
        .eq("id", runId)
        .maybeSingle<TestRun>(),
      supabase
        .from("test_cases")
        .select("id, name, description, position, status")
        .eq("test_run_id", runId)
        .order("position", { ascending: true })
        .returns<TestCase[]>(),
    ]);

    if (freshRun) setRun(freshRun);

    if (freshCases) {
      caseIdsRef.current = new Set(freshCases.map((c) => c.id));
      setCases(freshCases);

      if (freshCases.length > 0) {
        const { data: freshSteps } = await supabase
          .from("test_steps")
          .select(
            "id, test_case_id, position, action, selector, value, status, error_message, screenshot_url, duration_ms",
          )
          .in(
            "test_case_id",
            freshCases.map((c) => c.id),
          )
          .order("position", { ascending: true })
          .returns<TestStep[]>();
        if (freshSteps) setSteps(freshSteps);
      }
    }
  }, [runId]);

  useEffect(() => {
    const isActive = run.status === "pendiente" || run.status === "corriendo";

    const initial = setTimeout(() => {
      void refetch();
    }, 0);

    if (!isActive) {
      return () => clearTimeout(initial);
    }

    const interval = setInterval(() => {
      void refetch();
    }, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [run.status, refetch]);

  useEffect(() => {
    if (!openScreenshot) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpenScreenshot(null);
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openScreenshot]);

  const stepsByCase = useMemo(() => {
    const map = new Map<string, TestStep[]>();
    for (const step of steps) {
      const list = map.get(step.test_case_id) ?? [];
      list.push(step);
      map.set(step.test_case_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [steps]);

  const counts = useMemo(() => {
    const c = { passed: 0, failed: 0, skipped: 0, pendiente: 0, corriendo: 0 };
    for (const s of steps) {
      if (s.status === "passed") c.passed += 1;
      else if (s.status === "failed") c.failed += 1;
      else if (s.status === "skipped") c.skipped += 1;
      else if (s.status === "pendiente") c.pendiente += 1;
      else if (s.status === "corriendo") c.corriendo += 1;
    }
    return c;
  }, [steps]);

  const totalDurationMs = useMemo(() => {
    if (!run.started_at || !run.finished_at) return null;
    return (
      new Date(run.finished_at).getTime() -
      new Date(run.started_at).getTime()
    );
  }, [run.started_at, run.finished_at]);

  const isActive = run.status === "pendiente" || run.status === "corriendo";
  const pending = counts.pendiente + counts.corriendo;
  const progressPct =
    steps.length > 0
      ? Math.round(((counts.passed + counts.failed) / steps.length) * 100)
      : 0;

  // Último screenshot disponible — preview del modo en vivo.
  const latestShot = useMemo(() => {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i]!.screenshot_url) return steps[i]!.screenshot_url;
    }
    return null;
  }, [steps]);

  const allShots = steps.filter((s) => s.screenshot_url);

  const tabItems: TabItem[] = [
    { id: "pasos", label: "Pasos" },
    { id: "logs", label: "Logs", count: run.logs.length },
    { id: "screenshots", label: "Screenshots", count: allShots.length },
    { id: "network", label: "Network" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Run header con métricas ──────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 sm:px-5">
          <RunStatusBadge status={run.status} />
          <div className="flex items-center gap-5">
            <Stat label="passed" value={counts.passed} tone="success" />
            <Stat label="failed" value={counts.failed} tone="danger" />
            {counts.skipped > 0 ? (
              <Stat label="skipped" value={counts.skipped} tone="neutral" />
            ) : null}
            {pending > 0 ? (
              <Stat label="pendientes" value={pending} tone="running" />
            ) : null}
            <Stat
              label="errores js"
              value={run.js_error_count}
              tone={run.js_error_count > 0 ? "danger" : "neutral"}
            />
          </div>
          {totalDurationMs !== null ? (
            <span className="tabular ml-auto font-mono text-xs text-faint">
              {formatDuration(totalDurationMs)}
            </span>
          ) : null}
        </div>

        {isActive && steps.length > 0 ? (
          <div className="px-4 pb-4 sm:px-5">
            <div className="flex items-center justify-between gap-3 pb-1.5">
              <span className="font-mono text-[0.625rem] uppercase tracking-widest text-faint">
                progreso
              </span>
              <span className="tabular font-mono text-[0.625rem] text-faint">
                {counts.passed + counts.failed}/{steps.length} pasos
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso del run"
              className="h-1.5 overflow-hidden rounded-full bg-neutral-bg"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {run.error_message ? (
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <p className="flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-text">
              <AlertCircle size={15} className="mt-px shrink-0" />
              <span>{run.error_message}</span>
            </p>
          </div>
        ) : null}
      </Card>

      {/* ── Modo en vivo: preview + logs ─────────────────────────────── */}
      {isActive ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Card className="overflow-hidden">
            <header className="border-b border-border bg-surface-2 px-4 py-2.5 font-mono text-xs text-muted">
              vista previa · último paso
            </header>
            {latestShot ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={latestShot}
                alt="Última captura del run en vivo"
                className="max-h-[22rem] w-full bg-surface-2 object-contain"
              />
            ) : (
              <div className="flex items-center justify-center gap-2.5 px-6 py-16 text-sm text-muted">
                <Spinner size={15} />
                Esperando la primera captura.
              </div>
            )}
          </Card>
          <LogPanel logs={run.logs} live />
        </div>
      ) : null}

      {/* ── Empty state mientras arranca ─────────────────────────────── */}
      {cases.length === 0 ? (
        isActive ? (
          <Card className="flex items-center justify-center gap-2.5 px-6 py-12 text-sm text-muted">
            <Spinner size={15} />
            La IA está generando los casos de prueba.
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={Sparkles}
              title="Sin casos de prueba"
              description="Este run terminó sin que la IA generara casos. Revisa el mensaje de error o vuelve a intentarlo."
            />
          </Card>
        )
      ) : null}

      {/* ── Modo detalle: pestañas (solo cuando el run terminó) ──────── */}
      {!isActive && cases.length > 0 ? (
        <>
          <Tabs items={tabItems} value={tab} onValueChange={setTab} />

          {tab === "pasos"
            ? cases.map((tc) => {
                const list = stepsByCase.get(tc.id) ?? [];
                return (
                  <Card key={tc.id} className="overflow-hidden">
                    <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-text">
                          {tc.name}
                        </h3>
                        {tc.description ? (
                          <p className="mt-0.5 text-xs text-muted">
                            {tc.description}
                          </p>
                        ) : null}
                      </div>
                      <StepStatusBadge status={tc.status} />
                    </header>
                    {list.length === 0 ? (
                      <p className="px-4 py-4 text-xs text-faint sm:px-5">
                        Sin pasos registrados.
                      </p>
                    ) : (
                      <StepTimeline
                        steps={list}
                        onOpenScreenshot={setOpenScreenshot}
                      />
                    )}
                  </Card>
                );
              })
            : null}

          {tab === "logs" ? <LogPanel logs={run.logs} /> : null}

          {tab === "screenshots" ? (
            allShots.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allShots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setOpenScreenshot(s.screenshot_url)}
                    className="overflow-hidden rounded-lg border border-border bg-surface-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.screenshot_url ?? ""}
                      alt={`Captura del paso ${s.position + 1}`}
                      className="aspect-video w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState
                  icon={ImageIcon}
                  title="Sin capturas"
                  description="Este run no registró screenshots."
                />
              </Card>
            )
          ) : null}

          {tab === "network" ? (
            <Card>
              <EmptyState
                icon={Sparkles}
                title="Network — próximamente"
                description="La captura de peticiones de red estará disponible en una próxima versión."
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {/* ── Lightbox de captura ──────────────────────────────────────── */}
      {openScreenshot ? (
        <div
          className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Captura del paso"
        >
          <button
            type="button"
            aria-label="Cerrar captura"
            onClick={() => setOpenScreenshot(null)}
            className="absolute inset-0 bg-bg/90 backdrop-blur-md"
          />
          <figure className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-e3">
            <figcaption className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
                <ImageIcon size={13} />
                captura del paso
              </span>
              <button
                type="button"
                onClick={() => setOpenScreenshot(null)}
                aria-label="Cerrar"
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md",
                  "text-muted transition-colors hover:bg-elevated hover:text-text",
                )}
              >
                <Close size={15} />
              </button>
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={openScreenshot}
              alt="Captura de pantalla del paso de la prueba"
              className="max-h-[80vh] w-full bg-surface-2 object-contain"
            />
          </figure>
        </div>
      ) : null}
    </div>
  );
}

const STAT_TONE: Record<string, string> = {
  success: "text-success-text",
  danger: "text-danger-text",
  running: "text-running-text",
  neutral: "text-faint",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "running" | "neutral";
}): React.JSX.Element {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("tabular text-sm font-semibold", STAT_TONE[tone])}>
        {value}
      </span>
      <span className="text-[0.6875rem] uppercase tracking-[0.05em] text-faint">
        {label}
      </span>
    </span>
  );
}

function LogPanel({
  logs,
  live,
}: {
  logs: LogEntry[];
  live?: boolean;
}): React.JSX.Element {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="font-mono text-xs text-muted">
          {live ? "logs en vivo" : "logs"}
        </span>
        <span className="font-mono text-[0.6875rem] text-faint">
          {logs.length} líneas
        </span>
      </header>
      <div className="max-h-[22rem] overflow-auto bg-surface px-4 py-3 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-faint">Sin logs todavía.</p>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="shrink-0 text-faint">
                {String(i + 1).padStart(3, "0")}
              </span>
              <span
                className={cn(
                  "shrink-0 uppercase",
                  LOG_LEVEL_CLASS[entry.level] ?? "text-muted",
                )}
              >
                [{entry.level}]
              </span>
              <span className="text-muted">{entry.msg}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Verificar typecheck, lint y build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/runs/[id]/page.tsx" "app/dashboard/runs/[id]/_components/test-run-detail.tsx"
git commit -m "feat(dashboard): detalle con pestañas, métricas y modo en vivo"
```

---

## Fase 7 — Cierre

### Task 15: Limpieza y documentación

**Files:**
- Delete: `desing/` (carpeta completa)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Verificación funcional end-to-end manual**

Con la migración `0005` ya aplicada en Supabase:

1. `npm run dev` y, en otra terminal, `npm run worker`.
2. Crea un test run en `/dashboard/runs/new` eligiendo dispositivo "Mobile" y 2 reintentos.
3. Verifica en `/dashboard/runs/[id]`: la barra de progreso avanza, el panel de logs en vivo se puebla, y al terminar aparecen las pestañas Pasos/Logs/Screenshots/Network.
4. En Supabase Table Editor, confirma que la fila de `test_runs` tiene `device='mobile'`, `retries=2`, `logs` con entradas y `js_error_count` numérico.

Esperado: todo lo anterior se cumple. Si algo falla, corregir antes de continuar.

- [ ] **Step 2: Eliminar la carpeta del prototipo**

```bash
git rm -r desing
```

(Si `desing/` no está trackeada, usar `Remove-Item -Recurse -Force desing` en PowerShell.)

- [ ] **Step 3: Actualizar `CLAUDE.md`**

En `CLAUDE.md`, en la sección "Sistema de diseño y UI", añade al final de la lista una viñeta:

```markdown
- La configuración del runner (navegador, dispositivo, reintentos) vive en
  columnas de `test_runs` (migración `0005`). El worker captura un stream de
  logs (`test_runs.logs`) y el conteo de errores JS (`test_runs.js_error_count`).
  El detalle del run muestra logs y métricas; las features de Nivel C (API &
  webhooks, Configuración, plantillas, ejecución programada, Network) aparecen
  deshabilitadas en la UI.
```

En la sección "Tablas en Supabase", actualiza la línea de `test_runs`:

```markdown
- `test_runs` — un registro por ejecución (status, created_at, user_id,
  browser, device, retries, logs, js_error_count)
```

- [ ] **Step 4: Verificar typecheck, lint y build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: elimina el prototipo desing/ y actualiza CLAUDE.md"
```

---

## Self-Review

**Cobertura de la spec:**
- Sección 1 (modelo de datos) → Task 1. ✓
- Sección 2 (shell: En vivo, Cuenta, contadores, medidor, ⌘K, campana) → Tasks 9, 10. ✓
- Sección 3 (Resumen: saludo, sparklines, cola) → Task 11. ✓
- Sección 3 (Lista: botones deshabilitados) → Task 12. ✓
- Sección 3 (Nuevo run: config del runner, badges URL, footer) → Task 13. ✓
- Sección 3 (Detalle: pestañas, métricas, modo en vivo) → Task 14. ✓
- Sección 4 (validación Zod) → Task 2; (API) → Task 3; (cola) → Task 3; (worker: device, logs, errores JS) → Tasks 4, 5, 6. ✓
- Sección 5 (elementos deshabilitados) → Tasks 9, 10, 12, 13, 14. ✓
- Limpieza `desing/` + `CLAUDE.md` → Task 15. ✓

**Decisión consciente fuera de la spec:** la spec (Sección 3) sugería reestructurar la lista de runs a `<table>`; la Task 12 conserva el grid actual con cabecera porque ya cumple el lenguaje visual y es responsive — reescribir a `<table>` arriesgaría regresiones sin ganancia. La columna "Pasos" del prototipo se omite por el mismo motivo (evitar una query agregada por el conteo). Esto es coherente con el principio de la spec de no inventar complejidad; si se quiere la tabla literal, es una iteración aparte.

**Consistencia de tipos:** `executeTestRun(supabase, testRunId, testType?, device?)` se define en Task 5 y se invoca así en Task 4. `enqueueTestRun(data, attempts?)` se define en Task 3 (queue) y se invoca en Task 3 (API). `LogEntry { ts, level, msg }` es consistente entre worker (Task 6), `page.tsx` y `test-run-detail.tsx` (Task 14). `SidebarNav` recibe props opcionales con default (Task 9), compatible con su invocación sin props en `DashboardShell`.

**Placeholders:** sin TBD/TODO. Cada paso de código muestra el código completo.
