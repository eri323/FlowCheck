# Tipos de prueba adaptativos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer `navegacion`, `formulario`, `registro` y `ecommerce` tan robustos y veraces como `login`/`busqueda`, con detección adaptativa + verificación por comportamiento, y documentarlos en `FLUJOS-DE-PRUEBA.md`.

**Architecture:** Por cada tipo, un módulo nuevo en `worker/lib/` con (a) funciones puras testeables y (b) funciones que tocan el DOM verificadas con Chromium real. Se cablean en `worker/lib/execute-test-run.ts` con una rama por `testType`. Un módulo `adaptive-common.ts` aloja los helpers compartidos. La verificación por comportamiento es siempre el árbitro (sin falsos positivos).

**Tech Stack:** TypeScript strict, `playwright-core`, Vitest (unit + integración con servidor HTTP efímero), `@google/genai`. Sin `any`, solo exports nombrados.

---

## Convenciones para todas las tareas

- **Directorio del worker:** todos los comandos de test/typecheck se ejecutan desde `worker/`.
- **Correr un test:** `npx vitest run test/<archivo>.test.ts` (desde `worker/`).
- **Correr todo + typecheck:** `npm test` y `npm run typecheck` (desde `worker/`).
- **Patrón de fixture de integración:** copiar la estructura de `worker/test/adaptive-search.integration.test.ts` (servidor `http` efímero en `127.0.0.1:0`, `chromium.launch({ headless: true })`, `beforeAll`/`afterAll`/`beforeEach`/`afterEach`).
- **TDD estricto:** escribir el test, verlo fallar, implementar lo mínimo, verlo pasar, commit.
- **Sin `any`, solo named exports, queries Supabase con `{ data, error }`.**
- **Mensaje de commit:** terminar con `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## Estructura de archivos

| Archivo                                      | Responsabilidad                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `worker/lib/adaptive-common.ts`              | Helpers compartidos: `pickFirstVisible`, `pickFirstVisibleOrNull`, `ERROR_SELECTORS`, `readVisibleErrorText`, `detectNativeValidationBlock`, `SUCCESS_TEXT_REGEX`, `isSuccessTextVisible`, `SUBMIT_VERBS`, `findGenericSubmit`, constantes de timeout. |
| `worker/lib/adaptive-navegacion.ts`          | `looksLikeErrorPage`, `verifyPageHealthy`, `clickAdaptive`.                                                                                                                                                                                            |
| `worker/lib/adaptive-formulario.ts`          | `parseFields`, `asBoolean`, `isFormSubmitSelector`, `resolveField`, `fillField`, `fillAndSubmitForm`.                                                                                                                                                  |
| `worker/lib/adaptive-registro.ts`            | `isNameFillSelector`, `isConfirmPasswordSelector`, `isRegisterSubmitSelector`, `findNameField`, `findConfirmPasswordField`, `registerAndVerify`.                                                                                                       |
| `worker/lib/adaptive-ecommerce.ts`           | `isAddToCartSelector`, `isCheckoutNavSelector`, `isConfirmOrderSelector`, `isPaymentFieldSelector`, `splitExpiry`, `findAddToCart`, `addToCartStage`, `goToCheckoutStage`, `fillPaymentStage`, `confirmOrderAndVerify`.                                |
| `worker/lib/execute-test-run.ts`             | Ramas por `testType` para los 4 tipos nuevos.                                                                                                                                                                                                          |
| `worker/test/adaptive-*.test.ts`             | Unit de funciones puras.                                                                                                                                                                                                                               |
| `worker/test/adaptive-*.integration.test.ts` | Integración con Chromium real.                                                                                                                                                                                                                         |
| `FLUJOS-DE-PRUEBA.md`                        | Documento técnico + UX, construido fase por fase.                                                                                                                                                                                                      |
| `CLAUDE.md`                                  | Secciones de detección adaptativa nuevas (Fase 5).                                                                                                                                                                                                     |

---

# FASE 1 — Fundación compartida + `navegacion`

## Task 1.1: Crear `adaptive-common.ts` (funciones puras + constantes)

**Files:**

- Create: `worker/lib/adaptive-common.ts`
- Test: `worker/test/adaptive-common.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-common.test.ts
import { describe, expect, it } from "vitest";
import { SUCCESS_TEXT_REGEX, SUBMIT_VERBS } from "../lib/adaptive-common";

describe("SUCCESS_TEXT_REGEX", () => {
  it("detecta mensajes de éxito ES/EN", () => {
    for (const t of [
      "¡Gracias por tu compra!",
      "Operación exitosa",
      "Mensaje enviado correctamente",
      "Tu cuenta fue creada",
      "Thank you for your purchase!",
      "Your order has been placed",
      "Form submitted successfully",
    ]) {
      expect(SUCCESS_TEXT_REGEX.test(t)).toBe(true);
    }
  });

  it("no dispara con texto neutro", () => {
    for (const t of ["Inicia sesión", "Productos destacados", "Acerca de"]) {
      expect(SUCCESS_TEXT_REGEX.test(t)).toBe(false);
    }
  });
});

describe("SUBMIT_VERBS", () => {
  it("incluye verbos de envío comunes", () => {
    for (const v of [
      "enviar",
      "submit",
      "guardar",
      "continuar",
      "aceptar",
      "confirmar",
    ]) {
      expect(SUBMIT_VERBS).toContain(v);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-common.test.ts`
Expected: FAIL — `Cannot find module '../lib/adaptive-common'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// worker/lib/adaptive-common.ts
import type { Locator, Page } from "playwright-core";

export const VISIBILITY_PROBE_TIMEOUT_MS = 1_000;
export const SETTLE_TIMEOUT_MS = 2_000;
export const OUTCOME_POLL_INTERVAL_MS = 400;
export const OUTCOME_GRACE_MS = 500;

// Texto que delata éxito genérico. \b evita matches embebidos.
export const SUCCESS_TEXT_REGEX =
  /\b(gracias por (tu|su) compra|compra exitosa|operaci[oó]n exitosa|enviad[oa] correctamente|mensaje enviado|fue cread[oa]|cuenta creada|registro exitoso|pedido (realizado|confirmado)|thank you|successfully|success|order (placed|confirmed|received)|submitted)\b/i;

export const SUBMIT_VERBS = [
  "enviar",
  "submit",
  "guardar",
  "save",
  "continuar",
  "continue",
  "aceptar",
  "confirmar",
  "confirm",
  "send",
];

const SUBMIT_NAME_REGEX = new RegExp(
  `^\\s*(?:${SUBMIT_VERBS.map((v) => v.replace(/\s+/g, "\\s+")).join("|")})\\s*$`,
  "i",
);

export const ERROR_SELECTORS = [
  '[role="alert"]',
  '[role="status"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
  ".error",
  ".alert-danger",
  ".alert-error",
  ".form-error",
  ".field-error",
  ".invalid-feedback",
  '[class*="toast" i]',
  '[class*="snackbar" i]',
  '[class*="notification" i]',
  '[class*="error" i]',
  '[class*="alert" i]',
  '[data-testid*="error" i]',
  '[data-testid*="toast" i]',
];

export async function pickFirstVisible(
  candidates: Locator[],
  label: string,
): Promise<Locator> {
  const found = await pickFirstVisibleOrNull(candidates);
  if (found) return found;
  throw new Error(
    `No se encontró un ${label} visible mediante detección adaptativa.`,
  );
}

export async function pickFirstVisibleOrNull(
  candidates: Locator[],
): Promise<Locator | null> {
  for (const candidate of candidates) {
    try {
      const count = await candidate.count();
      if (count === 0) continue;
      const first = candidate.first();
      if (await first.isVisible({ timeout: VISIBILITY_PROBE_TIMEOUT_MS })) {
        return first;
      }
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

export async function readVisibleErrorText(
  page: Page,
): Promise<string | undefined> {
  for (const selector of ERROR_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    const probeLimit = Math.min(count, 5);
    for (let i = 0; i < probeLimit; i++) {
      const node = locator.nth(i);
      if (!(await node.isVisible().catch(() => false))) continue;
      const text = ((await node.textContent().catch(() => "")) ?? "").trim();
      if (text.length > 0) return text.slice(0, 200);
    }
  }
  const invalid = page.locator('input[aria-invalid="true"]').first();
  if (
    (await invalid.count().catch(() => 0)) > 0 &&
    (await invalid.isVisible().catch(() => false))
  ) {
    return "Un campo del formulario quedó marcado como aria-invalid='true'";
  }
  return undefined;
}

export async function detectNativeValidationBlock(
  page: Page,
): Promise<string | undefined> {
  return page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      if (form.noValidate) continue;
      if (form.checkValidity()) continue;
      for (const control of Array.from(form.elements)) {
        const candidate = control as HTMLInputElement;
        if (
          typeof candidate.checkValidity === "function" &&
          !candidate.checkValidity()
        ) {
          return (
            candidate.validationMessage ||
            "Validación nativa del navegador bloqueó el envío"
          );
        }
      }
    }
    return undefined;
  });
}

export async function isSuccessTextVisible(page: Page): Promise<boolean> {
  const locator = page.getByText(SUCCESS_TEXT_REGEX);
  const count = await locator.count().catch(() => 0);
  const probeLimit = Math.min(count, 5);
  for (let i = 0; i < probeLimit; i++) {
    if (
      await locator
        .nth(i)
        .isVisible()
        .catch(() => false)
    )
      return true;
  }
  return false;
}

export async function findGenericSubmit(
  page: Page,
  extraVerbs: string[] = [],
): Promise<Locator> {
  const nameRegex =
    extraVerbs.length > 0
      ? new RegExp(
          `^\\s*(?:${[...SUBMIT_VERBS, ...extraVerbs]
            .map((v) => v.replace(/\s+/g, "\\s+"))
            .join("|")})\\s*$`,
          "i",
        )
      : SUBMIT_NAME_REGEX;
  return pickFirstVisible(
    [
      page.locator('button[type="submit"]'),
      page.locator('input[type="submit"]'),
      page.getByRole("button", { name: nameRegex }),
      page
        .locator(':is(button, a, [role="button"])')
        .filter({ hasText: nameRegex }),
    ],
    "botón de submit",
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-common.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-common.ts worker/test/adaptive-common.test.ts
git commit -m "feat(worker): adaptive-common con helpers compartidos"
```

## Task 1.2: Integración de `adaptive-common` (helpers DOM)

**Files:**

- Create: `worker/test/adaptive-common.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-common.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  findGenericSubmit,
  pickFirstVisibleOrNull,
  readVisibleErrorText,
} from "../lib/adaptive-common";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/form":
      res.end(
        html(
          `<form><input name="x"><button type="submit">Guardar</button></form>`,
        ),
      );
      return;
    case "/error":
      res.end(html(`<div role="alert">Credenciales inválidas</div>`));
      return;
    case "/hidden":
      res.end(
        html(`<button type="submit" style="display:none">Enviar</button>`),
      );
      return;
    default:
      res.statusCode = 404;
      res.end(html("not found"));
  }
});

let browser: Browser;
let base: string;
let activePage: Page;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  activePage = await browser.newPage();
});
afterEach(async () => {
  await activePage?.close();
});

describe("findGenericSubmit (browser)", () => {
  it("encuentra el botón de submit por type", async () => {
    await activePage.goto(`${base}/form`);
    const submit = await findGenericSubmit(activePage);
    expect((await submit.textContent())?.trim()).toBe("Guardar");
  }, 20_000);
});

describe("readVisibleErrorText (browser)", () => {
  it("lee un role=alert visible", async () => {
    await activePage.goto(`${base}/error`);
    expect(await readVisibleErrorText(activePage)).toContain("inválidas");
  }, 20_000);
});

describe("pickFirstVisibleOrNull (browser)", () => {
  it("devuelve null si el único candidato está oculto", async () => {
    await activePage.goto(`${base}/hidden`);
    const found = await pickFirstVisibleOrNull([
      activePage.locator('button[type="submit"]'),
    ]);
    expect(found).toBeNull();
  }, 20_000);
});
```

- [ ] **Step 2: Run test to verify it passes** (la implementación ya existe de Task 1.1)

Run: `npx vitest run test/adaptive-common.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add worker/test/adaptive-common.integration.test.ts
git commit -m "test(worker): integración de adaptive-common"
```

## Task 1.3: `navegacion` — función pura `looksLikeErrorPage`

**Files:**

- Create: `worker/lib/adaptive-navegacion.ts`
- Test: `worker/test/adaptive-navegacion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-navegacion.test.ts
import { describe, expect, it } from "vitest";
import { looksLikeErrorPage } from "../lib/adaptive-navegacion";

describe("looksLikeErrorPage", () => {
  it("detecta páginas de error con poco contenido", () => {
    expect(looksLikeErrorPage("404 Not Found", "404 Not Found")).toBe(true);
    expect(looksLikeErrorPage("Error", "500 Internal Server Error")).toBe(true);
    expect(looksLikeErrorPage("", "This page could not be found")).toBe(true);
  });

  it("no marca una página real con mucho contenido aunque mencione 'error'", () => {
    const body =
      "Bienvenido. ".repeat(80) + "Reporta cualquier error al soporte.";
    expect(looksLikeErrorPage("Inicio", body)).toBe(false);
  });

  it("no marca una home normal", () => {
    expect(looksLikeErrorPage("Mi Tienda", "Productos ".repeat(50))).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-navegacion.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// worker/lib/adaptive-navegacion.ts
import type { Page } from "playwright-core";
import { SETTLE_TIMEOUT_MS } from "./adaptive-common";

const ERROR_PAGE_REGEX =
  /\b(404|500|403|not found|page (not|could not be) found|internal server error|forbidden|service unavailable|something went wrong)\b/i;

// Umbral de contenido: por debajo, una mención de "error" es sospechosa.
const MIN_CONTENT_LENGTH = 200;

export function looksLikeErrorPage(title: string, bodyText: string): boolean {
  const text = `${title} ${bodyText}`.trim();
  if (!ERROR_PAGE_REGEX.test(text)) return false;
  // Si la página tiene contenido sustancial, la mención de error es incidental.
  return bodyText.trim().length < MIN_CONTENT_LENGTH;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-navegacion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-navegacion.ts worker/test/adaptive-navegacion.test.ts
git commit -m "feat(worker): navegacion looksLikeErrorPage"
```

## Task 1.4: `navegacion` — `verifyPageHealthy` y `clickAdaptive` (DOM)

**Files:**

- Modify: `worker/lib/adaptive-navegacion.ts`
- Create: `worker/test/adaptive-navegacion.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-navegacion.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { clickAdaptive, verifyPageHealthy } from "../lib/adaptive-navegacion";

function html(body: string, title = "Demo"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/home":
      res.end(
        html(
          `<main><h1>Inicio</h1><p>${"Contenido real ".repeat(40)}</p>
        <a href="/about">Acerca de</a></main>`,
          "Mi Sitio",
        ),
      );
      return;
    case "/about":
      res.end(
        html(`<h1>Acerca de</h1><p>${"Info ".repeat(40)}</p>`, "Acerca de"),
      );
      return;
    case "/missing":
      res.statusCode = 404;
      res.end(html(`404 Not Found`, "404"));
      return;
    default:
      res.statusCode = 404;
      res.end(html("not found", "404"));
  }
});

let browser: Browser;
let base: string;
let activePage: Page;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(async () => {
  activePage = await browser.newPage();
});
afterEach(async () => {
  await activePage?.close();
});

describe("verifyPageHealthy (browser)", () => {
  it("una home con contenido es sana", async () => {
    await activePage.goto(`${base}/home`);
    const health = await verifyPageHealthy(activePage);
    expect(health.healthy).toBe(true);
    expect(health.title).toBe("Mi Sitio");
  }, 20_000);

  it("una página 404 con poco contenido NO es sana (sin falso positivo)", async () => {
    await activePage.goto(`${base}/missing`);
    const health = await verifyPageHealthy(activePage);
    expect(health.healthy).toBe(false);
  }, 20_000);
});

describe("clickAdaptive (browser)", () => {
  it("usa el selector literal cuando funciona", async () => {
    await activePage.goto(`${base}/home`);
    await clickAdaptive(activePage, 'a[href="/about"]', 5_000);
    await activePage.waitForLoadState("domcontentloaded");
    expect(activePage.url()).toContain("/about");
  }, 20_000);

  it("cae al texto cuando el selector literal no existe", async () => {
    await activePage.goto(`${base}/home`);
    // selector inválido para esta página, pero el texto 'Acerca de' existe
    await clickAdaptive(activePage, "text=Acerca de", 5_000);
    await activePage.waitForLoadState("domcontentloaded");
    expect(activePage.url()).toContain("/about");
  }, 20_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-navegacion.integration.test.ts`
Expected: FAIL — `verifyPageHealthy`/`clickAdaptive` no exportados.

- [ ] **Step 3: Write minimal implementation** (añadir a `adaptive-navegacion.ts`)

```ts
// añadir a worker/lib/adaptive-navegacion.ts

export type PageHealth = {
  healthy: boolean;
  finalUrl: string;
  title: string;
  reason: string;
};

const MIN_BODY_TEXT = 1; // al menos algo de texto renderizado

export async function verifyPageHealthy(page: Page): Promise<PageHealth> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});

  const finalUrl = page.url();
  const title = (await page.title().catch(() => "")) ?? "";
  const bodyText = (
    (await page
      .locator("body")
      .innerText({ timeout: SETTLE_TIMEOUT_MS })
      .catch(() => "")) ?? ""
  ).trim();

  if (bodyText.length < MIN_BODY_TEXT) {
    return {
      healthy: false,
      finalUrl,
      title,
      reason: "La página no renderizó contenido de texto visible.",
    };
  }
  if (looksLikeErrorPage(title, bodyText)) {
    return {
      healthy: false,
      finalUrl,
      title,
      reason: `La página parece un documento de error (título: "${title}").`,
    };
  }
  return {
    healthy: true,
    finalUrl,
    title,
    reason: `Página sana: cargó, tiene título "${title}" y contenido renderizado.`,
  };
}

export async function clickAdaptive(
  page: Page,
  selector: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await page.locator(selector).first().click({ timeout: timeoutMs });
    return;
  } catch (literalError) {
    // Fallback: extraer texto del selector y buscar un enlace/botón por texto.
    const text = extractTextHint(selector);
    if (text) {
      const byText = page
        .locator(':is(a, button, [role="button"], [role="link"])')
        .filter({ hasText: text })
        .first();
      if ((await byText.count().catch(() => 0)) > 0) {
        await byText.click({ timeout: timeoutMs });
        return;
      }
    }
    throw literalError;
  }
}

// Extrae una pista de texto de un selector tipo text=, :has-text(), [name="..."].
function extractTextHint(selector: string): string | null {
  const textEq = selector.match(/^text=["']?(.+?)["']?$/i);
  if (textEq) return textEq[1]!.trim();
  const hasText = selector.match(/has-text\(["'](.+?)["']\)/i);
  if (hasText) return hasText[1]!.trim();
  const nameAttr = selector.match(/name=["']([^"']+)["']/i);
  if (nameAttr) return nameAttr[1]!.trim();
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-navegacion.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-navegacion.ts worker/test/adaptive-navegacion.integration.test.ts
git commit -m "feat(worker): navegacion verifyPageHealthy + clickAdaptive"
```

## Task 1.5: Cablear `navegacion` en `execute-test-run.ts`

**Files:**

- Modify: `worker/lib/execute-test-run.ts`

- [ ] **Step 1: Añadir el import** (junto a los imports de adaptive-\*)

```ts
import { clickAdaptive, verifyPageHealthy } from "./adaptive-navegacion";
```

- [ ] **Step 2: Manejar los `expect_*` de navegación al inicio de `executeStep`**

En `executeStep`, justo después del bloque de la ventana de verificación de login (antes del `if (!isExpectAction)`), añadir:

```ts
if (ctx.testType === "navegacion" && isExpectAction) {
  const health = await verifyPageHealthy(page);
  if (!health.healthy) {
    throw new Error(
      `Navegación no saludable: ${health.reason} (URL: ${health.finalUrl})`,
    );
  }
  return {
    valueOverride: health.finalUrl,
    selectorOverride: "[adaptive] navegación verificada por salud de página",
  };
}
```

- [ ] **Step 3: Usar `clickAdaptive` para los clicks de navegación**

En el `case "click"`, antes de la línea final `await page.locator(step.selector).click(...)`, añadir:

```ts
if (ctx.testType === "navegacion") {
  await clickAdaptive(page, step.selector, STEP_TIMEOUT_MS);
  return { selectorOverride: "[adaptive] click tolerante" };
}
```

- [ ] **Step 4: Verificar typecheck y tests existentes**

Run: `npm run typecheck` (desde `worker/`)
Expected: sin errores.
Run: `npm test`
Expected: toda la suite verde (los tests previos no se rompen).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/execute-test-run.ts
git commit -m "feat(worker): cablear navegacion adaptativa en execute-test-run"
```

## Task 1.6: Iniciar `FLUJOS-DE-PRUEBA.md` con la sección de `navegacion`

**Files:**

- Create: `FLUJOS-DE-PRUEBA.md`

- [ ] **Step 1: Verificación en vivo con Playwright MCP**

Usar el navegador Playwright MCP para abrir `https://the-internet.herokuapp.com/`,
confirmar carga y contenido, y medir tiempos aproximados. Anotar los tiempos
reales observados.

- [ ] **Step 2: Escribir el documento (encabezado + sección navegación)**

Crear `FLUJOS-DE-PRUEBA.md` con: introducción (qué es cada test_type, la regla de
oro de verificación por comportamiento, cómo leer los tiempos) y la primera
sección:

```markdown
# Flujos de prueba — Cómo funciona cada tipo

## Navegación (smoke test)

### Cómo funciona técnicamente

- Detección: `worker/lib/adaptive-navegacion.ts` (`verifyPageHealthy`, `clickAdaptive`).
- Verificación por comportamiento: la página cargó, tiene título, renderizó
  contenido y no parece documento de error. Los clicks usan fallback por texto.

### Experiencia de usuario

- URL de ejemplo: `https://the-internet.herokuapp.com/`
- El usuario elige tipo "Navegación", pega la URL (sin datos extra).
- En ~<TIEMPO MEDIDO> s recibe: smoke test verde con screenshot del home cargado.
```

(Reemplazar `<TIEMPO MEDIDO>` con el valor real del Step 1.)

- [ ] **Step 3: Commit**

```bash
git add FLUJOS-DE-PRUEBA.md
git commit -m "docs: FLUJOS-DE-PRUEBA.md con sección de navegación"
```

---

# FASE 2 — `formulario`

## Task 2.1: Funciones puras `parseFields`, `asBoolean`, `isFormSubmitSelector`

**Files:**

- Create: `worker/lib/adaptive-formulario.ts`
- Test: `worker/test/adaptive-formulario.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-formulario.test.ts
import { describe, expect, it } from "vitest";
import {
  asBoolean,
  isFormSubmitSelector,
  parseFields,
} from "../lib/adaptive-formulario";

describe("parseFields", () => {
  it("parsea pares 'label: value' por línea", () => {
    expect(parseFields("Nombre: Ana\nEmail: ana@x.com")).toEqual([
      { label: "Nombre", value: "Ana" },
      { label: "Email", value: "ana@x.com" },
    ]);
  });
  it("acepta '=' y corta en el primer separador", () => {
    expect(parseFields("Comentario = a: b: c")).toEqual([
      { label: "Comentario", value: "a: b: c" },
    ]);
  });
  it("ignora líneas vacías y sin separador", () => {
    expect(parseFields("\nlinea sin separador\nCiudad: Bogotá\n")).toEqual([
      { label: "Ciudad", value: "Bogotá" },
    ]);
  });
});

describe("asBoolean", () => {
  it("reconoce verdaderos y falsos", () => {
    expect(asBoolean("sí")).toBe(true);
    expect(asBoolean("true")).toBe(true);
    expect(asBoolean("x")).toBe(true);
    expect(asBoolean("no")).toBe(false);
    expect(asBoolean("false")).toBe(false);
  });
  it("devuelve null si no es booleano", () => {
    expect(asBoolean("Bogotá")).toBeNull();
  });
});

describe("isFormSubmitSelector", () => {
  it("detecta selectores de submit", () => {
    expect(isFormSubmitSelector('button[type="submit"]')).toBe(true);
    expect(isFormSubmitSelector("text=Enviar")).toBe(true);
    expect(isFormSubmitSelector('role=button[name="Guardar"]')).toBe(true);
  });
  it("no marca un input de texto", () => {
    expect(isFormSubmitSelector('input[name="ciudad"]')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-formulario.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// worker/lib/adaptive-formulario.ts
import type { Locator, Page } from "playwright-core";
import {
  SETTLE_TIMEOUT_MS,
  SUBMIT_VERBS,
  detectNativeValidationBlock,
  findGenericSubmit,
  isSuccessTextVisible,
  pickFirstVisibleOrNull,
  readVisibleErrorText,
} from "./adaptive-common";

export type FieldPair = { label: string; value: string };

export function parseFields(raw: string): FieldPair[] {
  const out: FieldPair[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([^:=]+)[:=](.*)$/);
    if (!m) continue;
    const label = m[1]!.trim();
    const value = m[2]!.trim();
    if (label.length === 0) continue;
    out.push({ label, value });
  }
  return out;
}

const TRUE_TOKENS = new Set([
  "sí",
  "si",
  "true",
  "x",
  "yes",
  "on",
  "1",
  "checked",
]);
const FALSE_TOKENS = new Set(["no", "false", "off", "0", "unchecked"]);

export function asBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (TRUE_TOKENS.has(v)) return true;
  if (FALSE_TOKENS.has(v)) return false;
  return null;
}

const SUBMIT_TOKEN_REGEX = new RegExp(`(${SUBMIT_VERBS.join("|")})`, "i");

export function isFormSubmitSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=submit") || lower.includes('type="submit"'))
    return true;
  if (lower.includes("type=text") || lower.includes('type="text"'))
    return false;
  if (lower.startsWith("input[name")) return false;
  return SUBMIT_TOKEN_REGEX.test(lower);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-formulario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-formulario.ts worker/test/adaptive-formulario.test.ts
git commit -m "feat(worker): formulario funciones puras (parseFields, asBoolean, isFormSubmitSelector)"
```

## Task 2.2: `resolveField` y `fillField` (DOM)

**Files:**

- Modify: `worker/lib/adaptive-formulario.ts`
- Create: `worker/test/adaptive-formulario.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-formulario.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  fillAndSubmitForm,
  fillField,
  resolveField,
} from "../lib/adaptive-formulario";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Form</title></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/labeled":
      res.end(
        html(`
        <form action="/done" method="get">
          <label>Nombre completo <input name="full"></label>
          <label>Mensaje <textarea name="msg"></textarea></label>
          <label>País <select name="country"><option>México</option><option>Colombia</option></select></label>
          <label>Acepto términos <input type="checkbox" name="tos"></label>
          <button type="submit">Enviar</button>
        </form>`),
      );
      return;
    case "/done":
      res.end(html(`<h1>Gracias</h1><p>Formulario enviado correctamente</p>`));
      return;
    case "/noop":
      res.end(
        html(`
        <form id="f"><input name="a" placeholder="Campo A"><button type="submit">Enviar</button></form>
        <script>document.getElementById('f').addEventListener('submit', e => e.preventDefault());</script>`),
      );
      return;
    default:
      res.statusCode = 404;
      res.end(html("not found"));
  }
});

let browser: Browser;
let base: string;
let activePage: Page;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(async () => {
  activePage = await browser.newPage();
});
afterEach(async () => {
  await activePage?.close();
});

describe("resolveField + fillField (browser)", () => {
  it("resuelve por label y llena texto, textarea, select y checkbox", async () => {
    await activePage.goto(`${base}/labeled`);

    const name = await resolveField(activePage, "Nombre completo");
    expect(name).not.toBeNull();
    await fillField(name!, "Ana Pérez");
    expect(await activePage.locator('input[name="full"]').inputValue()).toBe(
      "Ana Pérez",
    );

    const msg = await resolveField(activePage, "Mensaje");
    await fillField(msg!, "Hola");
    expect(await activePage.locator('textarea[name="msg"]').inputValue()).toBe(
      "Hola",
    );

    const country = await resolveField(activePage, "País");
    await fillField(country!, "Colombia");
    expect(
      await activePage.locator('select[name="country"]').inputValue(),
    ).toBe("Colombia");

    const tos = await resolveField(activePage, "Acepto términos");
    await fillField(tos!, "sí");
    expect(await activePage.locator('input[name="tos"]').isChecked()).toBe(
      true,
    );
  }, 30_000);
});
```

(Este archivo también prueba `fillAndSubmitForm` en Task 2.3; se importa ya aquí.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-formulario.integration.test.ts`
Expected: FAIL — `resolveField`/`fillField`/`fillAndSubmitForm` no exportados.

- [ ] **Step 3: Write minimal implementation** (añadir a `adaptive-formulario.ts`)

```ts
// añadir a worker/lib/adaptive-formulario.ts

function slug(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "");
}

export async function resolveField(
  page: Page,
  label: string,
): Promise<Locator | null> {
  const escaped = label.replace(/["\\]/g, "\\$&");
  const s = slug(label);
  return pickFirstVisibleOrNull([
    page.getByLabel(new RegExp(escaped, "i")),
    page.getByPlaceholder(new RegExp(escaped, "i")),
    page.locator(`[aria-label*="${escaped}" i]`),
    page.locator(
      `input[name*="${s}" i], textarea[name*="${s}" i], select[name*="${s}" i]`,
    ),
    page.locator(
      `input[id*="${s}" i], textarea[id*="${s}" i], select[id*="${s}" i]`,
    ),
  ]);
}

export async function fillField(
  control: Locator,
  value: string,
): Promise<void> {
  const tag = (await control.evaluate((el) => el.tagName.toLowerCase())).trim();
  if (tag === "select") {
    await control.selectOption({ label: value }).catch(async () => {
      await control.selectOption(value);
    });
    return;
  }
  const type = ((await control.getAttribute("type")) ?? "").toLowerCase();
  if (type === "checkbox" || type === "radio") {
    const bool = asBoolean(value);
    if (bool === false) await control.uncheck().catch(() => {});
    else await control.check();
    return;
  }
  await control.fill(value);
}
```

- [ ] **Step 4: Run the resolveField/fillField test** (no el de submit aún)

Run: `npx vitest run test/adaptive-formulario.integration.test.ts -t "resuelve por label"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-formulario.ts worker/test/adaptive-formulario.integration.test.ts
git commit -m "feat(worker): formulario resolveField + fillField"
```

## Task 2.3: `fillAndSubmitForm` (orquestación + verificación + trampa de falso positivo)

**Files:**

- Modify: `worker/lib/adaptive-formulario.ts`
- Modify: `worker/test/adaptive-formulario.integration.test.ts`

- [ ] **Step 1: Añadir tests de orquestación**

Agregar al final del `describe` del archivo de integración:

```ts
describe("fillAndSubmitForm (browser)", () => {
  it("llena por label, envía y verifica éxito (GET clásico)", async () => {
    await activePage.goto(`${base}/labeled`);
    const outcome = await fillAndSubmitForm(
      activePage,
      [
        { label: "Nombre completo", value: "Ana" },
        { label: "Mensaje", value: "Hola" },
      ],
      8_000,
    );
    expect(outcome.success).toBe(true);
    expect(outcome.finalUrl).toContain("/done");
  }, 30_000);

  it("trampa de falso positivo: form que no hace nada → success=false", async () => {
    await activePage.goto(`${base}/noop`);
    const outcome = await fillAndSubmitForm(
      activePage,
      [{ label: "Campo A", value: "valor" }],
      4_000,
      { resultsTimeoutMs: 1_500 },
    );
    expect(outcome.success).toBe(false);
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-formulario.integration.test.ts -t "fillAndSubmitForm"`
Expected: FAIL — `fillAndSubmitForm` no implementado.

- [ ] **Step 3: Write minimal implementation** (añadir a `adaptive-formulario.ts`)

```ts
// añadir a worker/lib/adaptive-formulario.ts

const FORM_POLL_INTERVAL_MS = 300;
const FORM_RESULTS_TIMEOUT_MS = 8_000;

export type FormOutcome = {
  success: boolean;
  finalUrl: string;
  reason: string;
};

export async function fillAndSubmitForm(
  page: Page,
  fields: FieldPair[],
  timeoutMs: number,
  opts: { resultsTimeoutMs?: number } = {},
): Promise<FormOutcome> {
  const initialUrl = page.url();
  let filled = 0;
  for (const { label, value } of fields) {
    const control = await resolveField(page, label);
    if (!control) continue;
    try {
      await fillField(control, value);
      filled += 1;
    } catch {
      // campo no llenable; el árbitro sigue siendo la verificación
    }
  }
  if (filled === 0) {
    return {
      success: false,
      finalUrl: page.url(),
      reason:
        "No se pudo resolver ningún campo del formulario por su etiqueta.",
    };
  }

  let submit: Locator;
  try {
    submit = await findGenericSubmit(page);
  } catch {
    return {
      success: false,
      finalUrl: page.url(),
      reason: "No se encontró un botón de envío del formulario.",
    };
  }
  await submit.click({ timeout: timeoutMs });

  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});

  const deadline =
    Date.now() + (opts.resultsTimeoutMs ?? FORM_RESULTS_TIMEOUT_MS);
  while (Date.now() < deadline) {
    // Fallo inmediato si hay error visible o bloqueo de validación nativa.
    const errorText = await readVisibleErrorText(page);
    if (errorText) {
      return {
        success: false,
        finalUrl: page.url(),
        reason: `Error visible tras enviar: "${errorText}"`,
      };
    }
    const nativeBlock = await detectNativeValidationBlock(page);
    if (nativeBlock) {
      return {
        success: false,
        finalUrl: page.url(),
        reason: `Validación nativa bloqueó el envío: "${nativeBlock}"`,
      };
    }
    // Éxito por comportamiento: URL cambió, mensaje de éxito, o form desapareció.
    if (page.url() !== initialUrl) {
      return {
        success: true,
        finalUrl: page.url(),
        reason: "La URL cambió tras enviar.",
      };
    }
    if (await isSuccessTextVisible(page)) {
      return {
        success: true,
        finalUrl: page.url(),
        reason: "Apareció un mensaje de éxito tras enviar.",
      };
    }
    const formGone =
      (await page
        .locator("form")
        .count()
        .catch(() => 0)) === 0;
    if (formGone) {
      return {
        success: true,
        finalUrl: page.url(),
        reason: "El formulario desapareció tras enviar.",
      };
    }
    await page.waitForTimeout(FORM_POLL_INTERVAL_MS);
  }

  return {
    success: false,
    finalUrl: page.url(),
    reason:
      "Tras enviar no hubo ninguna señal de éxito: la URL no cambió, no apareció " +
      "mensaje de éxito ni desapareció el formulario, y no se detectó error visible. " +
      "Revisa el screenshot.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-formulario.integration.test.ts`
Expected: PASS (todos, incluida la trampa de falso positivo).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-formulario.ts worker/test/adaptive-formulario.integration.test.ts
git commit -m "feat(worker): formulario fillAndSubmitForm con verificación por comportamiento"
```

## Task 2.4: Cablear `formulario` en `execute-test-run.ts`

**Files:**

- Modify: `worker/lib/execute-test-run.ts`

- [ ] **Step 1: Imports y contexto**

Añadir import:

```ts
import {
  fillAndSubmitForm,
  isFormSubmitSelector,
  parseFields,
} from "./adaptive-formulario";
```

Añadir al tipo `LoginRunContext` un campo para los pares del formulario:

```ts
  /** Pares label:value del formulario (test_data.fields), para el submit. */
  formFields?: { label: string; value: string }[];
```

- [ ] **Step 2: Pasar `test_data` al executor**

El executor hoy recibe `testType` y `device`. Necesita los pares del formulario.
En `executeTestRun`, aceptar un parámetro opcional `formFieldsRaw?: string` y al
crear `loginCtx` en `runCase`, parsearlo. Cambios:

En la firma de `executeTestRun`:

```ts
export async function executeTestRun(
  supabase: SupabaseClient,
  testRunId: string,
  testType?: TestType,
  device: "desktop" | "mobile" = "desktop",
  formFieldsRaw?: string,
): Promise<"completado" | "fallido"> {
```

Pasar `formFieldsRaw` a `runCase` (añadir parámetro) y al construir `loginCtx`:

```ts
const loginCtx: LoginRunContext = {
  testType,
  inVerificationWindow: false,
  formFields: formFieldsRaw ? parseFields(formFieldsRaw) : undefined,
};
```

- [ ] **Step 3: Manejar el submit de formulario en `case "click"`**

En `case "click"`, antes del click literal final, añadir:

```ts
if (ctx.testType === "formulario" && isFormSubmitSelector(step.selector)) {
  const outcome = await fillAndSubmitForm(
    page,
    ctx.formFields ?? [],
    STEP_TIMEOUT_MS,
  );
  if (!outcome.success) {
    throw new Error(
      `Formulario adaptativo falló: ${outcome.reason} (URL: ${outcome.finalUrl})`,
    );
  }
  return {
    valueOverride: outcome.finalUrl,
    selectorOverride: "[adaptive] formulario enviado y verificado",
  };
}
```

- [ ] **Step 4: Pasar `test_data.fields` desde `process-test-run.ts`**

En `worker/process-test-run.ts`, en la llamada a `executeTestRun`, pasar el raw
de fields cuando aplique:

```ts
const finalStatus = await withTimeout(
  executeTestRun(
    supabase,
    testRunId,
    testRun.test_type,
    testRun.device,
    testRun.test_type === "formulario"
      ? String(testRun.test_data.fields ?? "")
      : undefined,
  ),
  EXECUTION_TIMEOUT_MS,
  "Ejecución del plan con Playwright",
);
```

- [ ] **Step 5: Typecheck + suite**

Run: `npm run typecheck`
Expected: sin errores.
Run: `npm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/execute-test-run.ts worker/process-test-run.ts
git commit -m "feat(worker): cablear formulario adaptativo en execute-test-run"
```

## Task 2.5: Sección de `formulario` en `FLUJOS-DE-PRUEBA.md`

**Files:**

- Modify: `FLUJOS-DE-PRUEBA.md`

- [ ] **Step 1: Verificación en vivo con Playwright MCP** contra `https://httpbin.org/forms/post`, midiendo tiempos.

- [ ] **Step 2: Añadir la sección** (mismo formato que navegación):

```markdown
## Formulario (llenado genérico)

### Cómo funciona técnicamente

- Detección: `worker/lib/adaptive-formulario.ts` (`resolveField`, `fillField`, `fillAndSubmitForm`).
- El usuario describe campos como `etiqueta: valor`. La heurística resuelve cada
  campo por label/placeholder/name/id, lo llena según su tipo (texto, textarea,
  select, checkbox), envía y verifica por comportamiento (URL cambió / mensaje de
  éxito / form desapareció). Trampa de falso positivo cubierta por tests.

### Experiencia de usuario

- URL de ejemplo: `https://httpbin.org/forms/post`
- Campos: `Customer name: Ana`, `Telephone: 555`, `Email: ana@x.com`, etc.
- En ~<TIEMPO MEDIDO> s recibe: envío verde con la página de eco del POST.
```

- [ ] **Step 3: Commit**

```bash
git add FLUJOS-DE-PRUEBA.md
git commit -m "docs: sección de formulario en FLUJOS-DE-PRUEBA.md"
```

---

# FASE 3 — `registro`

## Task 3.1: Detectores puros de `registro`

**Files:**

- Create: `worker/lib/adaptive-registro.ts`
- Test: `worker/test/adaptive-registro.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-registro.test.ts
import { describe, expect, it } from "vitest";
import {
  isConfirmPasswordSelector,
  isNameFillSelector,
  isRegisterSubmitSelector,
} from "../lib/adaptive-registro";

describe("isNameFillSelector", () => {
  it("detecta campos de nombre", () => {
    expect(isNameFillSelector('input[name="name"]')).toBe(true);
    expect(isNameFillSelector('input[name="nombre"]')).toBe(true);
    expect(isNameFillSelector('input[name="fullname"]')).toBe(true);
    expect(isNameFillSelector('[placeholder="Nombre completo"]')).toBe(true);
  });
  it("no marca email ni password", () => {
    expect(isNameFillSelector('input[type="email"]')).toBe(false);
    expect(isNameFillSelector('input[type="password"]')).toBe(false);
  });
});

describe("isConfirmPasswordSelector", () => {
  it("detecta confirmación de contraseña", () => {
    expect(isConfirmPasswordSelector('input[name="confirmPassword"]')).toBe(
      true,
    );
    expect(
      isConfirmPasswordSelector('input[name="password_confirmation"]'),
    ).toBe(true);
    expect(
      isConfirmPasswordSelector('[placeholder="Repetir contraseña"]'),
    ).toBe(true);
  });
  it("no marca la contraseña principal", () => {
    expect(isConfirmPasswordSelector('input[name="password"]')).toBe(false);
  });
});

describe("isRegisterSubmitSelector", () => {
  it("detecta verbos de registro", () => {
    expect(isRegisterSubmitSelector("text=Crear cuenta")).toBe(true);
    expect(isRegisterSubmitSelector('role=button[name="Sign up"]')).toBe(true);
    expect(isRegisterSubmitSelector('button[type="submit"]')).toBe(true);
  });
  it("no marca un input de texto", () => {
    expect(isRegisterSubmitSelector('input[name="email"]')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-registro.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// worker/lib/adaptive-registro.ts
import type { Locator, Page } from "playwright-core";
import {
  OUTCOME_GRACE_MS,
  OUTCOME_POLL_INTERVAL_MS,
  SETTLE_TIMEOUT_MS,
  detectNativeValidationBlock,
  findGenericSubmit,
  isSuccessTextVisible,
  pickFirstVisibleOrNull,
  readVisibleErrorText,
} from "./adaptive-common";
import {
  findEmailField,
  findPasswordField,
  looksLikeEmail,
  type LoginOutcome,
} from "./adaptive-login";

const NAME_TOKENS = [
  "fullname",
  "full-name",
  "name",
  "nombre",
  "firstname",
  "first-name",
  "given-name",
];
const CONFIRM_TOKENS = [
  "confirm",
  "confirmation",
  "confirmar",
  "repeat",
  "repetir",
  "again",
  "verificar",
  "_2",
  "retype",
];
const REGISTER_VERBS = [
  "registrar",
  "registrarme",
  "regístrate",
  "registrate",
  "crear cuenta",
  "crear",
  "sign up",
  "signup",
  "register",
  "unirse",
  "create account",
];

const NAME_REGEX = new RegExp(`(${NAME_TOKENS.join("|")})`, "i");
const CONFIRM_REGEX = new RegExp(`(${CONFIRM_TOKENS.join("|")})`, "i");
const REGISTER_REGEX = new RegExp(`(${REGISTER_VERBS.join("|")})`, "i");
const REGISTER_NAME_REGEX = new RegExp(
  `^\\s*(?:${REGISTER_VERBS.map((v) => v.replace(/\s+/g, "\\s+")).join("|")})\\s*$`,
  "i",
);

export function isNameFillSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("type=email") ||
    lower.includes('type="email"')
  ) {
    return false;
  }
  if (lower.includes("type=password") || lower.includes('type="password"'))
    return false;
  return NAME_REGEX.test(lower);
}

export function isConfirmPasswordSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  const isPasswordLike =
    lower.includes("password") ||
    lower.includes("contrase") ||
    lower.includes("clave");
  return isPasswordLike && CONFIRM_REGEX.test(lower);
}

export function isRegisterSubmitSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=submit") || lower.includes('type="submit"'))
    return true;
  return REGISTER_REGEX.test(lower);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-registro.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-registro.ts worker/test/adaptive-registro.test.ts
git commit -m "feat(worker): registro detectores puros"
```

## Task 3.2: `findNameField`, `findConfirmPasswordField`, `registerAndVerify` (DOM)

**Files:**

- Modify: `worker/lib/adaptive-registro.ts`
- Create: `worker/test/adaptive-registro.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-registro.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  findConfirmPasswordField,
  findNameField,
  registerAndVerify,
} from "../lib/adaptive-registro";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Reg</title></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/signup":
      res.end(
        html(`
        <form action="/welcome" method="get">
          <input name="name" placeholder="Nombre">
          <input type="email" name="email" placeholder="Email">
          <input type="password" name="password" placeholder="Contraseña">
          <input type="password" name="confirm" placeholder="Repetir contraseña">
          <button type="submit">Crear cuenta</button>
        </form>`),
      );
      return;
    case "/welcome":
      res.end(html(`<h1>Bienvenido</h1><p>Tu cuenta fue creada</p>`));
      return;
    case "/dup":
      // Trampa: siempre muestra error de email duplicado, no navega.
      res.end(
        html(`
        <form id="f">
          <input name="name"><input type="email" name="email">
          <input type="password" name="password">
          <button type="submit">Registrar</button>
        </form>
        <div role="alert" style="display:none" id="e">El email ya está en uso</div>
        <script>document.getElementById('f').addEventListener('submit', e => {
          e.preventDefault(); document.getElementById('e').style.display='block';
        });</script>`),
      );
      return;
    default:
      res.statusCode = 404;
      res.end(html("not found"));
  }
});

let browser: Browser;
let base: string;
let activePage: Page;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(async () => {
  activePage = await browser.newPage();
});
afterEach(async () => {
  await activePage?.close();
});

describe("findNameField / findConfirmPasswordField (browser)", () => {
  it("encuentra nombre y el segundo password como confirmación", async () => {
    await activePage.goto(`${base}/signup`);
    expect(await (await findNameField(activePage))!.getAttribute("name")).toBe(
      "name",
    );
    expect(
      await (await findConfirmPasswordField(activePage))!.getAttribute("name"),
    ).toBe("confirm");
  }, 20_000);
});

describe("registerAndVerify (browser)", () => {
  it("registro exitoso → success por cambio de URL", async () => {
    await activePage.goto(`${base}/signup`);
    const outcome = await registerAndVerify(
      activePage,
      {
        name: "Ana",
        email: "ana@x.com",
        password: "Secret123",
        confirmPassword: "Secret123",
      },
      activePage.url(),
      8_000,
    );
    expect(outcome.success).toBe(true);
    expect(outcome.finalUrl).toContain("/welcome");
  }, 30_000);

  it("trampa: email duplicado → success=false con el error real", async () => {
    await activePage.goto(`${base}/dup`);
    const outcome = await registerAndVerify(
      activePage,
      {
        name: "Ana",
        email: "ana@x.com",
        password: "Secret123",
        confirmPassword: "Secret123",
      },
      activePage.url(),
      4_000,
    );
    expect(outcome.success).toBe(false);
    expect(outcome.reason.toLowerCase()).toContain("uso");
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-registro.integration.test.ts`
Expected: FAIL — funciones DOM no exportadas.

- [ ] **Step 3: Write minimal implementation** (añadir a `adaptive-registro.ts`)

```ts
// añadir a worker/lib/adaptive-registro.ts

const NAME_LABEL_REGEX = /(nombre|name|full\s*name|first\s*name)/i;

export async function findNameField(page: Page): Promise<Locator | null> {
  return pickFirstVisibleOrNull([
    page.locator('input[autocomplete="name"]'),
    page.locator('input[autocomplete="given-name"]'),
    page.locator('input[name*="fullname" i]'),
    page.locator('input[name*="nombre" i]'),
    page.locator('input[name="name" i]'),
    page.locator('input[name*="firstname" i]'),
    page.locator(
      'input[id*="name" i]:not([type="email"]):not([type="password"])',
    ),
    page.getByLabel(NAME_LABEL_REGEX),
    page.getByPlaceholder(NAME_LABEL_REGEX),
  ]);
}

export async function findConfirmPasswordField(
  page: Page,
): Promise<Locator | null> {
  // Estrategia primaria: si hay 2+ inputs password, el segundo es "confirmar".
  const passwords = page.locator('input[type="password"]');
  const count = await passwords.count().catch(() => 0);
  if (count >= 2) {
    const second = passwords.nth(1);
    if (await second.isVisible().catch(() => false)) return second;
  }
  // Secundaria: por tokens de confirmación.
  return pickFirstVisibleOrNull([
    page.locator('input[name*="confirm" i]'),
    page.locator('input[name*="repeat" i]'),
    page.locator('input[name*="repetir" i]'),
    page.getByLabel(/(confirm|repetir|repeat|verificar)/i),
    page.getByPlaceholder(/(confirm|repetir|repeat|verificar)/i),
  ]);
}

export type RegisterOutcome = LoginOutcome;

const OUTCOME_TIMEOUT_DEFAULT_MS = 15_000;
const DUP_EMAIL_REGEX =
  /(ya (está|esta) (en uso|registrad)|already (taken|registered|in use)|email exists|usuario existente)/i;

export async function registerAndVerify(
  page: Page,
  data: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  },
  initialUrl: string,
  timeoutMs: number,
): Promise<RegisterOutcome> {
  // Llenar campos disponibles (los ausentes se omiten).
  const nameField = await findNameField(page);
  if (nameField) await nameField.fill(data.name).catch(() => {});

  const emailField = await findEmailField(page);
  if (!looksLikeEmail(data.email)) {
    await emailField.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.type = "text";
      input.removeAttribute("pattern");
      if (input.form) input.form.noValidate = true;
    });
  }
  await emailField.fill(data.email, { timeout: timeoutMs });

  const passwordField = await findPasswordField(page);
  await passwordField.fill(data.password, { timeout: timeoutMs });

  const confirmField = await findConfirmPasswordField(page);
  if (confirmField)
    await confirmField.fill(data.confirmPassword).catch(() => {});

  const submit = await findGenericSubmit(page, REGISTER_VERBS);
  await submit.click({ timeout: timeoutMs });

  return verifyRegisterOutcome(page, initialUrl);
}

async function verifyRegisterOutcome(
  page: Page,
  initialUrl: string,
): Promise<RegisterOutcome> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});

  const deadline = Date.now() + OUTCOME_TIMEOUT_DEFAULT_MS;
  while (Date.now() < deadline) {
    const currentUrl = page.url();
    if (currentUrl !== initialUrl) {
      await page.waitForTimeout(OUTCOME_GRACE_MS);
      return {
        success: true,
        finalUrl: page.url(),
        initialUrl,
        reason: `La URL cambió de ${initialUrl} a ${page.url()} — registro aceptado.`,
      };
    }
    const errorText = await readVisibleErrorText(page);
    if (errorText) {
      const dup = DUP_EMAIL_REGEX.test(errorText);
      return {
        success: false,
        finalUrl: currentUrl,
        initialUrl,
        reason: dup
          ? `El email ya está en uso: "${errorText}"`
          : `Error visible tras el registro: "${errorText}"`,
        errorText,
      };
    }
    const nativeBlock = await detectNativeValidationBlock(page);
    if (nativeBlock) {
      return {
        success: false,
        finalUrl: page.url(),
        initialUrl,
        reason: `Validación nativa bloqueó el registro: "${nativeBlock}"`,
        errorText: nativeBlock,
      };
    }
    if (await isSuccessTextVisible(page)) {
      await page.waitForTimeout(OUTCOME_GRACE_MS);
      return {
        success: true,
        finalUrl: page.url(),
        initialUrl,
        reason: "Apareció un mensaje de éxito tras el registro.",
      };
    }
    await page.waitForTimeout(OUTCOME_POLL_INTERVAL_MS);
  }

  return {
    success: false,
    finalUrl: page.url(),
    initialUrl,
    reason:
      "Tras enviar el registro no hubo cambio de URL, ni mensaje de éxito, ni error " +
      "visible. Causas probables: validación silenciosa, redirect lento o selector " +
      "de submit erróneo. Revisa el screenshot.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-registro.integration.test.ts`
Expected: PASS (incluida la trampa de email duplicado).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-registro.ts worker/test/adaptive-registro.integration.test.ts
git commit -m "feat(worker): registro findNameField/findConfirmPasswordField/registerAndVerify"
```

## Task 3.3: Cablear `registro` en `execute-test-run.ts`

**Files:**

- Modify: `worker/lib/execute-test-run.ts`

- [ ] **Step 1: Imports y contexto**

Añadir import:

```ts
import {
  isConfirmPasswordSelector,
  isNameFillSelector,
  isRegisterSubmitSelector,
  registerAndVerify,
} from "./adaptive-registro";
```

Añadir al `LoginRunContext`:

```ts
  /** test_data del registro, para el submit adaptativo. */
  registroData?: { name: string; email: string; password: string; confirmPassword: string };
```

- [ ] **Step 2: Pasar registroData al executor**

En `executeTestRun` y `runCase`, añadir un parámetro opcional
`registroData?: {...}` (mismo tipo) y asignarlo al `loginCtx`. En
`process-test-run.ts`, pasarlo cuando `test_type === "registro"`:

```ts
      testRun.test_type === "registro"
        ? {
            name: String(testRun.test_data.name ?? ""),
            email: String(testRun.test_data.email ?? ""),
            password: String(testRun.test_data.password ?? ""),
            confirmPassword: String(testRun.test_data.confirmPassword ?? ""),
          }
        : undefined,
```

(Para no encadenar muchos parámetros posicionales, refactorizar `executeTestRun`
para recibir un objeto `opts: { testType?, device?, formFieldsRaw?, registroData? }`
es aceptable; si se hace, actualizar también la llamada en `process-test-run.ts`
y los tests que invoquen `executeTestRun`.)

- [ ] **Step 3: Manejar fills de registro en `case "fill"`**

Añadir una rama `if (ctx.testType === "registro")` análoga a la de login, antes
del fill literal:

```ts
if (ctx.testType === "registro") {
  if (isConfirmPasswordSelector(step.selector)) {
    const field = await findConfirmPasswordField(page);
    if (field) {
      await field.fill(step.value, { timeout: STEP_TIMEOUT_MS });
      return { selectorOverride: "[adaptive] confirmar password" };
    }
  }
  if (isPasswordFillSelector(step.selector)) {
    const field = await findPasswordField(page);
    await field.fill(step.value, { timeout: STEP_TIMEOUT_MS });
    return { selectorOverride: "[adaptive] password" };
  }
  if (isNameFillSelector(step.selector)) {
    const field = await findNameField(page);
    if (field) {
      await field.fill(step.value, { timeout: STEP_TIMEOUT_MS });
      return { selectorOverride: "[adaptive] nombre" };
    }
  }
  if (isEmailFillSelector(step.selector)) {
    const { relaxed } = await fillIdentifierField(
      page,
      step.value,
      STEP_TIMEOUT_MS,
    );
    return {
      selectorOverride: relaxed
        ? "[adaptive] identificador (validación nativa relajada)"
        : "[adaptive] email/usuario",
    };
  }
}
```

(Asegurar que `findConfirmPasswordField`, `findNameField` están importados.)

- [ ] **Step 4: Manejar el submit de registro en `case "click"`**

```ts
if (ctx.testType === "registro" && isRegisterSubmitSelector(step.selector)) {
  const initialUrl = page.url();
  const outcome = await registerAndVerify(
    page,
    ctx.registroData ?? {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    initialUrl,
    STEP_TIMEOUT_MS,
  );
  ctx.lastOutcome = outcome;
  if (!outcome.success) {
    throw new Error(
      `Registro adaptativo falló: ${outcome.reason} (URL: ${outcome.finalUrl})`,
    );
  }
  ctx.inVerificationWindow = true;
  return {
    valueOverride: outcome.finalUrl,
    selectorOverride: "[adaptive] submit registro",
  };
}
```

- [ ] **Step 5: Extender la ventana de verificación a registro**

En el bloque inicial de `executeStep` que hoy chequea `ctx.testType === "login"`
para la ventana de verificación, ampliar a registro:

```ts
if (
  (ctx.testType === "login" || ctx.testType === "registro") &&
  ctx.inVerificationWindow &&
  ctx.lastOutcome?.success &&
  isExpectAction
) {
  return {
    valueOverride: ctx.lastOutcome.finalUrl,
    selectorOverride:
      ctx.testType === "registro"
        ? "[adaptive] verificado por comportamiento post-registro"
        : "[adaptive] verificado por comportamiento post-login",
  };
}
```

- [ ] **Step 6: Typecheck + suite**

Run: `npm run typecheck`
Expected: sin errores.
Run: `npm test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/execute-test-run.ts worker/process-test-run.ts
git commit -m "feat(worker): cablear registro adaptativo en execute-test-run"
```

## Task 3.4: Sección de `registro` en `FLUJOS-DE-PRUEBA.md`

**Files:**

- Modify: `FLUJOS-DE-PRUEBA.md`

- [ ] **Step 1: Verificación en vivo con Playwright MCP** contra
      `https://demo.realworld.io/#/register` con email/usuario aleatorios, midiendo
      tiempos.

- [ ] **Step 2: Añadir la sección:**

```markdown
## Registro (alta de cuenta)

### Cómo funciona técnicamente

- Detección: `worker/lib/adaptive-registro.ts` (`findNameField`,
  `findConfirmPasswordField`, `registerAndVerify`); reusa el detector de
  email/password de login. Tolera apps sin "confirmar contraseña".
- Verificación por comportamiento: URL cambió / mensaje de éxito / form
  desapareció; detecta el error "email ya en uso" como fallo real.

### Experiencia de usuario

- URL de ejemplo: `https://demo.realworld.io/#/register` (Conduit)
- Datos: nombre/usuario, email (único por corrida), contraseña.
- En ~<TIEMPO MEDIDO> s recibe: registro verde con redirección al feed.
```

- [ ] **Step 3: Commit**

```bash
git add FLUJOS-DE-PRUEBA.md
git commit -m "docs: sección de registro en FLUJOS-DE-PRUEBA.md"
```

---

# FASE 4 — `ecommerce`

## Task 4.1: Detectores puros de `ecommerce` + `splitExpiry`

**Files:**

- Create: `worker/lib/adaptive-ecommerce.ts`
- Test: `worker/test/adaptive-ecommerce.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/adaptive-ecommerce.test.ts
import { describe, expect, it } from "vitest";
import {
  isAddToCartSelector,
  isCheckoutNavSelector,
  isConfirmOrderSelector,
  isPaymentFieldSelector,
  splitExpiry,
} from "../lib/adaptive-ecommerce";

describe("detectores de ecommerce", () => {
  it("isAddToCartSelector", () => {
    expect(isAddToCartSelector("text=Add to cart")).toBe(true);
    expect(isAddToCartSelector("text=Agregar al carrito")).toBe(true);
    expect(isAddToCartSelector("text=Añadir")).toBe(true);
    expect(isAddToCartSelector('input[name="email"]')).toBe(false);
  });
  it("isCheckoutNavSelector", () => {
    expect(isCheckoutNavSelector("text=Checkout")).toBe(true);
    expect(isCheckoutNavSelector("text=Place Order")).toBe(true);
    expect(isCheckoutNavSelector("text=Realizar pedido")).toBe(true);
  });
  it("isConfirmOrderSelector", () => {
    expect(isConfirmOrderSelector("text=Purchase")).toBe(true);
    expect(isConfirmOrderSelector("text=Pagar")).toBe(true);
    expect(isConfirmOrderSelector("text=Comprar ahora")).toBe(true);
  });
  it("isPaymentFieldSelector", () => {
    expect(isPaymentFieldSelector('input[name="card"]')).toBe(true);
    expect(isPaymentFieldSelector('input[name="cvc"]')).toBe(true);
    expect(isPaymentFieldSelector('[placeholder="Número de tarjeta"]')).toBe(
      true,
    );
    expect(isPaymentFieldSelector('input[name="city"]')).toBe(false);
  });
});

describe("splitExpiry", () => {
  it("parte MM/AA", () => {
    expect(splitExpiry("09/27")).toEqual({ month: "09", year: "27" });
  });
  it("tolera MM/AAAA", () => {
    expect(splitExpiry("12/2030")).toEqual({ month: "12", year: "2030" });
  });
  it("devuelve vacíos si no parsea", () => {
    expect(splitExpiry("xx")).toEqual({ month: "", year: "" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-ecommerce.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// worker/lib/adaptive-ecommerce.ts
import type { Locator, Page } from "playwright-core";
import {
  SETTLE_TIMEOUT_MS,
  isSuccessTextVisible,
  pickFirstVisibleOrNull,
} from "./adaptive-common";
import { resolveField } from "./adaptive-formulario";

const ADD_TO_CART_REGEX =
  /(add to cart|add to bag|agregar al carrito|añadir al carrito|anadir al carrito|añadir|anadir|agregar|comprar|buy now|buy)/i;
const CHECKOUT_NAV_REGEX =
  /(checkout|place order|realizar pedido|finalizar compra|finalizar|proceed|ir al carrito|ver carrito|cart|carrito|basket|bag)/i;
const CONFIRM_ORDER_REGEX =
  /(purchase|place order|pay\b|pagar|confirmar compra|confirmar pedido|comprar ahora|comprar|finalizar compra|complete order|submit order)/i;
const PAYMENT_FIELD_REGEX =
  /(card|tarjeta|cc-number|cardnumber|credit|cvc|cvv|security code|expir|vencimiento|mm\/aa|mm\/yy)/i;

export function isAddToCartSelector(selector?: string | null): boolean {
  return !!selector && ADD_TO_CART_REGEX.test(selector.toLowerCase());
}
export function isCheckoutNavSelector(selector?: string | null): boolean {
  return !!selector && CHECKOUT_NAV_REGEX.test(selector.toLowerCase());
}
export function isConfirmOrderSelector(selector?: string | null): boolean {
  return !!selector && CONFIRM_ORDER_REGEX.test(selector.toLowerCase());
}
export function isPaymentFieldSelector(selector?: string | null): boolean {
  return !!selector && PAYMENT_FIELD_REGEX.test(selector.toLowerCase());
}

export function splitExpiry(expiry: string): { month: string; year: string } {
  const m = expiry.trim().match(/^(\d{1,2})\s*[/\-]\s*(\d{2,4})$/);
  if (!m) return { month: "", year: "" };
  return { month: m[1]!.padStart(2, "0"), year: m[2]! };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-ecommerce.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-ecommerce.ts worker/test/adaptive-ecommerce.test.ts
git commit -m "feat(worker): ecommerce detectores puros + splitExpiry"
```

## Task 4.2: Etapas DOM de `ecommerce` (add-to-cart, checkout, pago, confirmar)

**Files:**

- Modify: `worker/lib/adaptive-ecommerce.ts`
- Create: `worker/test/adaptive-ecommerce.integration.test.ts`

- [ ] **Step 1: Write the failing test** (fixture que simula una tienda mínima)

```ts
// worker/test/adaptive-ecommerce.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  addToCartStage,
  confirmOrderAndVerify,
  fillPaymentStage,
  goToCheckoutStage,
} from "../lib/adaptive-ecommerce";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shop</title></head><body>${body}</body></html>`;
}

// Tienda SPA mínima: agregar al carrito (contador), checkout (muestra form),
// confirmar (muestra "Thank you for your purchase").
const shop = `
  <div>Carrito: <span id="count">0</span></div>
  <button id="add">Add to cart</button>
  <a id="cart" href="#cart" style="display:none">Checkout</a>
  <form id="pay" style="display:none">
    <input name="card" placeholder="Card number">
    <input name="month" placeholder="MM">
    <input name="year" placeholder="YY">
    <input name="cvc" placeholder="CVC">
    <button type="button" id="buy">Purchase</button>
  </form>
  <div id="done"></div>
  <script>
    let n = 0;
    add.addEventListener('click', () => { n++; count.textContent = n; cart.style.display='inline'; });
    cart.addEventListener('click', () => { pay.style.display='block'; });
    buy.addEventListener('click', () => { done.innerHTML = '<h1>Thank you for your purchase!</h1>'; });
  </script>`;

// Tienda rota: botón comprar que no confirma nada (trampa de falso positivo).
const broken = `
  <button id="add">Add to cart</button>
  <a id="cart" href="#cart">Checkout</a>
  <form id="pay"><input name="card"><button type="button" id="buy">Purchase</button></form>
  <div id="done"></div>
  <script>
    add.addEventListener('click', () => {});
    buy.addEventListener('click', () => {});
  </script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (url.pathname === "/shop") return void res.end(html(shop));
  if (url.pathname === "/broken") return void res.end(html(broken));
  res.statusCode = 404;
  res.end(html("not found"));
});

let browser: Browser;
let base: string;
let activePage: Page;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(async () => {
  activePage = await browser.newPage();
});
afterEach(async () => {
  await activePage?.close();
});

describe("flujo ecommerce (browser)", () => {
  it("carrito → checkout → pago → confirmación verde", async () => {
    await activePage.goto(`${base}/shop`);

    expect((await addToCartStage(activePage, 5_000)).success).toBe(true);
    expect((await goToCheckoutStage(activePage, 5_000)).success).toBe(true);
    expect(
      (
        await fillPaymentStage(
          activePage,
          {
            email: "a@x.com",
            card: "4111111111111111",
            expiry: "09/27",
            cvc: "123",
          },
          5_000,
        )
      ).success,
    ).toBe(true);

    const order = await confirmOrderAndVerify(activePage, 5_000);
    expect(order.success).toBe(true);
  }, 40_000);

  it("trampa: confirmar no produce confirmación → success=false", async () => {
    await activePage.goto(`${base}/broken`);
    await addToCartStage(activePage, 3_000).catch(() => {});
    await goToCheckoutStage(activePage, 3_000).catch(() => {});
    const order = await confirmOrderAndVerify(activePage, 2_000);
    expect(order.success).toBe(false);
  }, 40_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adaptive-ecommerce.integration.test.ts`
Expected: FAIL — etapas no implementadas.

- [ ] **Step 3: Write minimal implementation** (añadir a `adaptive-ecommerce.ts`)

```ts
// añadir a worker/lib/adaptive-ecommerce.ts

export type StageOutcome = { success: boolean; reason: string };
export type OrderOutcome = {
  success: boolean;
  finalUrl: string;
  reason: string;
};
export type EcommerceData = {
  email: string;
  card: string;
  expiry: string;
  cvc: string;
};

const ORDER_CONFIRM_TIMEOUT_MS = 8_000;
const POLL_MS = 300;

export async function findAddToCart(page: Page): Promise<Locator | null> {
  return pickFirstVisibleOrNull([
    page.getByRole("button", { name: ADD_TO_CART_REGEX }),
    page.getByRole("link", { name: ADD_TO_CART_REGEX }),
    page
      .locator(':is(button, a, [role="button"])')
      .filter({ hasText: ADD_TO_CART_REGEX }),
    page.locator('[data-testid*="add-to-cart" i], [class*="add-to-cart" i]'),
  ]);
}

export async function addToCartStage(
  page: Page,
  timeoutMs: number,
): Promise<StageOutcome> {
  // Aceptar diálogos nativos (algunas tiendas hacen alert("Producto agregado")).
  page.on("dialog", (d) => void d.accept().catch(() => {}));
  const button = await findAddToCart(page);
  if (!button)
    return {
      success: false,
      reason: "No se encontró el botón de agregar al carrito.",
    };
  await button.click({ timeout: timeoutMs });
  await page.waitForTimeout(POLL_MS);
  return { success: true, reason: "Producto agregado al carrito." };
}

export async function goToCheckoutStage(
  page: Page,
  timeoutMs: number,
): Promise<StageOutcome> {
  const nav = await pickFirstVisibleOrNull([
    page.getByRole("link", { name: CHECKOUT_NAV_REGEX }),
    page.getByRole("button", { name: CHECKOUT_NAV_REGEX }),
    page
      .locator(':is(a, button, [role="button"])')
      .filter({ hasText: CHECKOUT_NAV_REGEX }),
    page.locator('[href*="cart" i], [href*="checkout" i]'),
  ]);
  if (!nav)
    return {
      success: false,
      reason: "No se encontró cómo ir al carrito/checkout.",
    };
  await nav.click({ timeout: timeoutMs });
  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});
  return { success: true, reason: "Avanzó al carrito/checkout." };
}

export async function fillPaymentStage(
  page: Page,
  data: EcommerceData,
  timeoutMs: number,
): Promise<StageOutcome> {
  // Email (si lo pide el checkout).
  if (data.email) {
    const emailCtl = await resolveField(page, "email");
    if (emailCtl)
      await emailCtl.fill(data.email, { timeout: timeoutMs }).catch(() => {});
  }
  // Tarjeta.
  const cardCtl = await pickFirstVisibleOrNull([
    page.locator('input[name*="card" i]:not([name*="holder" i])'),
    page.locator('input[autocomplete="cc-number"]'),
    page.getByPlaceholder(/(card|tarjeta|número de tarjeta)/i),
  ]);
  if (cardCtl)
    await cardCtl.fill(data.card, { timeout: timeoutMs }).catch(() => {});

  // Expiry: campo único o mes/año separados.
  const { month, year } = splitExpiry(data.expiry);
  const expCombined = await pickFirstVisibleOrNull([
    page.locator('input[autocomplete="cc-exp"]'),
    page.getByPlaceholder(/(mm\/aa|mm\/yy|expir|vencimiento)/i),
  ]);
  if (expCombined) {
    await expCombined.fill(data.expiry, { timeout: timeoutMs }).catch(() => {});
  } else {
    const monthCtl = await pickFirstVisibleOrNull([
      page.locator('input[name*="month" i], input[name*="mes" i]'),
    ]);
    const yearCtl = await pickFirstVisibleOrNull([
      page.locator(
        'input[name*="year" i], input[name*="anio" i], input[name*="año" i]',
      ),
    ]);
    if (monthCtl && month)
      await monthCtl.fill(month, { timeout: timeoutMs }).catch(() => {});
    if (yearCtl && year)
      await yearCtl.fill(year, { timeout: timeoutMs }).catch(() => {});
  }

  // CVC.
  const cvcCtl = await pickFirstVisibleOrNull([
    page.locator('input[name*="cvc" i], input[name*="cvv" i]'),
    page.locator('input[autocomplete="cc-csc"]'),
    page.getByPlaceholder(/(cvc|cvv|security code|código de seguridad)/i),
  ]);
  if (cvcCtl)
    await cvcCtl.fill(data.cvc, { timeout: timeoutMs }).catch(() => {});

  return {
    success: true,
    reason: "Datos de pago completados (los campos ausentes se omiten).",
  };
}

export async function confirmOrderAndVerify(
  page: Page,
  timeoutMs: number,
): Promise<OrderOutcome> {
  const confirm = await pickFirstVisibleOrNull([
    page.getByRole("button", { name: CONFIRM_ORDER_REGEX }),
    page
      .locator(':is(button, a, [role="button"])')
      .filter({ hasText: CONFIRM_ORDER_REGEX }),
    page.locator('input[type="submit"]'),
  ]);
  if (!confirm) {
    return {
      success: false,
      finalUrl: page.url(),
      reason: "No se encontró el botón de confirmar/pagar.",
    };
  }
  await confirm.click({ timeout: timeoutMs });
  await page.waitForTimeout(POLL_MS);

  const deadline = Date.now() + ORDER_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isSuccessTextVisible(page)) {
      return {
        success: true,
        finalUrl: page.url(),
        reason: "Confirmación de orden detectada (mensaje de éxito).",
      };
    }
    await page.waitForTimeout(POLL_MS);
  }
  return {
    success: false,
    finalUrl: page.url(),
    reason:
      "No se detectó confirmación de la orden tras pagar. La compra no se pudo " +
      "verificar por comportamiento (posible pago en iframe, validación fallida o " +
      "flujo distinto). Revisa el screenshot.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adaptive-ecommerce.integration.test.ts`
Expected: PASS (flujo verde + trampa de falso positivo).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/adaptive-ecommerce.ts worker/test/adaptive-ecommerce.integration.test.ts
git commit -m "feat(worker): ecommerce etapas DOM con verificación de orden"
```

## Task 4.3: Cablear `ecommerce` en `execute-test-run.ts`

**Files:**

- Modify: `worker/lib/execute-test-run.ts`

- [ ] **Step 1: Imports y contexto**

```ts
import {
  addToCartStage,
  confirmOrderAndVerify,
  fillPaymentStage,
  goToCheckoutStage,
  isAddToCartSelector,
  isCheckoutNavSelector,
  isConfirmOrderSelector,
  isPaymentFieldSelector,
} from "./adaptive-ecommerce";
```

Añadir al `LoginRunContext`:

```ts
  /** Datos de pago para ecommerce. */
  ecommerceData?: { email: string; card: string; expiry: string; cvc: string };
```

Y pasarlo desde `process-test-run.ts` (igual patrón que registro) cuando
`test_type === "ecommerce"`.

- [ ] **Step 2: Manejar clicks por intención en `case "click"`**

Antes del click literal final:

```ts
if (ctx.testType === "ecommerce") {
  if (isConfirmOrderSelector(step.selector)) {
    const outcome = await confirmOrderAndVerify(page, STEP_TIMEOUT_MS);
    if (!outcome.success) {
      throw new Error(
        `Confirmación de orden falló: ${outcome.reason} (URL: ${outcome.finalUrl})`,
      );
    }
    return {
      valueOverride: outcome.finalUrl,
      selectorOverride: "[adaptive] confirmar orden",
    };
  }
  if (isAddToCartSelector(step.selector)) {
    const stage = await addToCartStage(page, STEP_TIMEOUT_MS);
    if (!stage.success)
      throw new Error(`Agregar al carrito falló: ${stage.reason}`);
    return { selectorOverride: "[adaptive] agregar al carrito" };
  }
  if (isCheckoutNavSelector(step.selector)) {
    const stage = await goToCheckoutStage(page, STEP_TIMEOUT_MS);
    if (!stage.success) throw new Error(`Ir a checkout falló: ${stage.reason}`);
    return { selectorOverride: "[adaptive] ir a checkout" };
  }
}
```

(El orden importa: confirmar > add-to-cart > checkout, porque "comprar" puede
matchear varias regex. Confirmar primero evita tratar el botón final como
add-to-cart.)

- [ ] **Step 3: Manejar fills de pago en `case "fill"`**

```ts
if (ctx.testType === "ecommerce" && isPaymentFieldSelector(step.selector)) {
  await fillPaymentStage(
    page,
    ctx.ecommerceData ?? { email: "", card: "", expiry: "", cvc: "" },
    STEP_TIMEOUT_MS,
  );
  return { selectorOverride: "[adaptive] datos de pago" };
}
```

(Nota: `fillPaymentStage` llena todos los campos de pago de una; los `fill`
subsiguientes de pago serán idempotentes. Es aceptable porque la verificación de
orden es el árbitro.)

- [ ] **Step 4: Typecheck + suite**

Run: `npm run typecheck`
Expected: sin errores.
Run: `npm test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/execute-test-run.ts worker/process-test-run.ts
git commit -m "feat(worker): cablear ecommerce adaptativo en execute-test-run"
```

## Task 4.4: Sección de `ecommerce` en `FLUJOS-DE-PRUEBA.md`

**Files:**

- Modify: `FLUJOS-DE-PRUEBA.md`

- [ ] **Step 1: Verificación en vivo con Playwright MCP** contra
      `https://www.demoblaze.com/`, midiendo tiempos.

- [ ] **Step 2: Añadir la sección** (incluir el límite de iframes):

```markdown
## E-commerce (compra completa)

### Cómo funciona técnicamente

- Detección: `worker/lib/adaptive-ecommerce.ts` (macro por etapas:
  `addToCartStage`, `goToCheckoutStage`, `fillPaymentStage`,
  `confirmOrderAndVerify`).
- Verificación por comportamiento: el éxito SOLO se declara si se detecta la
  confirmación de la orden. Trampa de falso positivo cubierta por tests.
- Límite conocido: pagos en iframe (Stripe/PayPal) no son accesibles inline; la
  macro lo reporta con un diagnóstico claro.

### Experiencia de usuario

- URL de ejemplo: `https://www.demoblaze.com/`
- Datos: email, tarjeta, vencimiento (MM/AA), CVC.
- En ~<TIEMPO MEDIDO> s recibe: compra verde con la confirmación de la orden.
```

- [ ] **Step 3: Commit**

```bash
git add FLUJOS-DE-PRUEBA.md
git commit -m "docs: sección de ecommerce en FLUJOS-DE-PRUEBA.md"
```

---

# FASE 5 — Cierre: documento, login/búsqueda y CLAUDE.md

## Task 5.1: Completar `FLUJOS-DE-PRUEBA.md` con `login` y `busqueda`

**Files:**

- Modify: `FLUJOS-DE-PRUEBA.md`

- [ ] **Step 1: Verificación en vivo con Playwright MCP** de login y búsqueda
      contra demos canónicos (login: `https://www.saucedemo.com/` con
      `standard_user`/`secret_sauce`; búsqueda: `https://www.demoblaze.com/` o
      cualquier sitio con buscador), midiendo tiempos.

- [ ] **Step 2: Añadir las dos secciones restantes** (login y búsqueda) con el
      mismo formato (técnico + UX + tiempos reales), citando
      `worker/lib/adaptive-login.ts` y `worker/lib/adaptive-search.ts`. Añadir al
      inicio del documento una tabla resumen de los 6 tipos con su demo y su criterio
      de verificación por comportamiento.

- [ ] **Step 3: Commit**

```bash
git add FLUJOS-DE-PRUEBA.md
git commit -m "docs: completar FLUJOS-DE-PRUEBA.md con login y búsqueda + tabla resumen"
```

## Task 5.2: Actualizar `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Añadir secciones de detección adaptativa**

Replicando el estilo de las secciones existentes de login/búsqueda, documentar:
"Detección adaptativa en flujos de navegación", "…de formulario", "…de registro"
y "…en flujos de e-commerce" — cada una con helpers, cómo se activa, reporte en
la UI (prefijos `[adaptive]`) y tests. Actualizar también el bullet de la sección
"Heurística adaptativa por `test_type`" para listar los 6 tipos cubiertos.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md con detección adaptativa de los 6 tipos"
```

## Task 5.3: Verificación final completa

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Suite completa del worker**

Run: `npm test` (desde `worker/`)
Expected: TODA la suite verde (common, navegacion, formulario, registro,
ecommerce, login, search, server, concurrency, sweep).

- [ ] **Step 2: Typecheck y lint**

Run: `npm run typecheck` (desde `worker/`) → sin errores.
Run (desde la raíz): `npm run typecheck` y `npm run lint` → limpios.
Run (desde la raíz): `npm test` → suite de API verde.

- [ ] **Step 3: Verificación de integridad del documento**

Confirmar que `FLUJOS-DE-PRUEBA.md` tiene los 6 tipos con tiempos reales medidos
(sin `<TIEMPO MEDIDO>` pendientes) y que cada sección cita su módulo.

- [ ] **Step 4: Commit final (si quedaron ajustes)**

```bash
git add -A
git commit -m "chore: cierre tipos de prueba adaptativos — suite verde y docs completos"
```

---

## Notas de verificación en vivo (Playwright MCP)

Para cada tipo, el flujo de verificación en vivo es: abrir la URL demo con el
navegador Playwright MCP, ejecutar manualmente el flujo que la heurística
automatiza, confirmar el comportamiento esperado y **anotar el tiempo real**
(generación del plan + ejecución). Estos tiempos alimentan los `<TIEMPO MEDIDO>`
del documento. Los tests de integración (contra fixtures locales) son la garantía
de CI; la verificación en vivo es la evidencia de que funciona contra sitios
reales.

## Riesgos conocidos al ejecutar el plan

- **Demos externas cambian de maquetado** → la verificación en vivo puede requerir
  ajustar tokens; los tests de integración (fixtures locales) no dependen de ello.
- **`executeTestRun` acumula parámetros** → si supera 4-5 posicionales,
  refactorizar a un objeto `opts` en una sola tarea y actualizar sus llamadas y
  tests (mencionado en Task 3.3 Step 2).
- **demoblaze usa `window.alert`/SweetAlert** → `addToCartStage` ya registra un
  handler de `dialog`; verificar que el SweetAlert final de "Thank you" se detecta
  por texto (no es un dialog nativo, es DOM).
