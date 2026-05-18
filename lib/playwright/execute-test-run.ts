import {
  chromium,
  devices,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadScreenshot } from "../storage/upload-screenshot";
import { assertSafeNavigationUrl } from "./safe-url";
import type { TestType } from "../validation/test-run";
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

type StepAction =
  | "goto"
  | "click"
  | "fill"
  | "expect_visible"
  | "expect_text"
  | "expect_url";

type LoginRunContext = {
  testType?: TestType;
  lastOutcome?: LoginOutcome;
  inVerificationWindow: boolean;
};

type StepResult = { valueOverride?: string; selectorOverride?: string };

type StepRow = {
  id: string;
  position: number;
  action: StepAction;
  selector: string | null;
  value: string | null;
};

type CaseRow = {
  id: string;
  name: string;
  position: number;
  steps: StepRow[];
};

const STEP_TIMEOUT_MS = 30_000;

export class TestExecutionError extends Error {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = "TestExecutionError";
    this.originalError = originalError;
  }
}

async function loadCasesForRun(
  supabase: SupabaseClient,
  testRunId: string,
): Promise<CaseRow[]> {
  const { data: cases, error: casesError } = await supabase
    .from("test_cases")
    .select("id, name, position")
    .eq("test_run_id", testRunId)
    .order("position", { ascending: true });

  if (casesError) {
    throw new TestExecutionError(
      `No se pudieron leer los test_cases: ${casesError.message}`,
      casesError,
    );
  }
  if (!cases || cases.length === 0) {
    throw new TestExecutionError("El test_run no tiene test_cases para ejecutar");
  }

  const caseIds = cases.map((c) => c.id);
  const { data: steps, error: stepsError } = await supabase
    .from("test_steps")
    .select("id, test_case_id, position, action, selector, value")
    .in("test_case_id", caseIds)
    .order("position", { ascending: true });

  if (stepsError) {
    throw new TestExecutionError(
      `No se pudieron leer los test_steps: ${stepsError.message}`,
      stepsError,
    );
  }

  const stepsByCase = new Map<string, StepRow[]>();
  for (const raw of steps ?? []) {
    const list = stepsByCase.get(raw.test_case_id) ?? [];
    list.push({
      id: raw.id,
      position: raw.position,
      action: raw.action as StepAction,
      selector: raw.selector,
      value: raw.value,
    });
    stepsByCase.set(raw.test_case_id, list);
  }

  return cases.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    steps: stepsByCase.get(c.id) ?? [],
  }));
}

async function executeStep(
  page: Page,
  step: StepRow,
  ctx: LoginRunContext,
): Promise<StepResult> {
  const isExpectAction =
    step.action === "expect_visible" ||
    step.action === "expect_text" ||
    step.action === "expect_url";

  if (
    ctx.testType === "login" &&
    ctx.inVerificationWindow &&
    ctx.lastOutcome?.success &&
    isExpectAction
  ) {
    return {
      valueOverride: ctx.lastOutcome.finalUrl,
      selectorOverride: "[adaptive] verificado por comportamiento post-login",
    };
  }

  if (!isExpectAction) {
    ctx.inVerificationWindow = false;
  }

  switch (step.action) {
    case "goto": {
      if (!step.value) throw new Error("La acción 'goto' requiere un value (URL)");
      assertSafeNavigationUrl(step.value);
      await page.goto(step.value, { timeout: STEP_TIMEOUT_MS, waitUntil: "load" });
      return {};
    }
    case "click": {
      if (!step.selector) throw new Error("La acción 'click' requiere un selector");
      if (ctx.testType === "login" && isLoginSubmitSelector(step.selector)) {
        const initialUrl = page.url();
        const submit = await findSubmitButton(page);
        await submit.click({ timeout: STEP_TIMEOUT_MS });
        const outcome = await verifyLoginOutcome(page, initialUrl);
        ctx.lastOutcome = outcome;
        if (!outcome.success) {
          throw new Error(
            `Submit adaptativo falló: ${outcome.reason} (URL final: ${outcome.finalUrl})`,
          );
        }
        ctx.inVerificationWindow = true;
        return {
          valueOverride: outcome.finalUrl,
          selectorOverride: "[adaptive] submit",
        };
      }
      await page.locator(step.selector).click({ timeout: STEP_TIMEOUT_MS });
      return {};
    }
    case "fill": {
      if (!step.selector) throw new Error("La acción 'fill' requiere un selector");
      if (step.value === null) throw new Error("La acción 'fill' requiere un value");
      if (ctx.testType === "login") {
        if (isPasswordFillSelector(step.selector)) {
          const field = await findPasswordField(page);
          await field.fill(step.value, { timeout: STEP_TIMEOUT_MS });
          return { selectorOverride: "[adaptive] password" };
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
      await page.locator(step.selector).fill(step.value, { timeout: STEP_TIMEOUT_MS });
      return {};
    }
    case "expect_visible": {
      if (!step.selector)
        throw new Error("La acción 'expect_visible' requiere un selector");
      await page
        .locator(step.selector)
        .first()
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
      return {};
    }
    case "expect_text": {
      if (!step.selector)
        throw new Error("La acción 'expect_text' requiere un selector");
      if (!step.value) throw new Error("La acción 'expect_text' requiere un value");
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
      const text = (await locator.textContent({ timeout: STEP_TIMEOUT_MS })) ?? "";
      if (!text.toLowerCase().includes(step.value.toLowerCase())) {
        throw new Error(
          `El texto esperado "${step.value}" no aparece en el elemento. Texto actual: "${text.trim().slice(0, 200)}"`,
        );
      }
      return {};
    }
    case "expect_url": {
      if (ctx.testType === "login") {
        const outcome =
          ctx.lastOutcome ?? (await verifyLoginOutcome(page, page.url()));
        ctx.lastOutcome = outcome;
        if (!outcome.success) {
          throw new Error(
            `Verificación post-login fallida: ${outcome.reason} (URL final: ${outcome.finalUrl})`,
          );
        }
        return { valueOverride: outcome.finalUrl };
      }
      if (!step.value) throw new Error("La acción 'expect_url' requiere un value");
      const current = page.url();
      if (!current.includes(step.value)) {
        throw new Error(
          `La URL actual "${current}" no contiene el fragmento esperado "${step.value}"`,
        );
      }
      return {};
    }
    default: {
      const exhaustive: never = step.action;
      throw new Error(`Acción no soportada: ${String(exhaustive)}`);
    }
  }
}

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
  const page = await context.newPage();
  const loginCtx: LoginRunContext = { testType, inVerificationWindow: false };
  let caseFailed = false;

  try {
    for (const step of testCase.steps) {
      if (caseFailed) {
        await supabase
          .from("test_steps")
          .update({ status: "skipped" })
          .eq("id", step.id);
        continue;
      }

      await supabase
        .from("test_steps")
        .update({ status: "corriendo" })
        .eq("id", step.id);

      const startedAt = Date.now();
      let errorMessage: string | null = null;
      let valueOverride: string | undefined;
      let selectorOverride: string | undefined;

      try {
        const result = await executeStep(page, step, loginCtx);
        valueOverride = result.valueOverride;
        selectorOverride = result.selectorOverride;
      } catch (error) {
        errorMessage =
          error instanceof Error ? error.message : "Error desconocido en el paso";
        if (loginCtx.lastOutcome) {
          valueOverride = loginCtx.lastOutcome.finalUrl;
        }
      }

      let screenshotUrl: string | null = null;
      try {
        const png = await page.screenshot({ fullPage: false });
        screenshotUrl = await uploadScreenshot(
          supabase,
          testRunId,
          step.id,
          Buffer.from(png),
        );
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Error desconocido al guardar screenshot";
        console.warn(`Screenshot del paso ${step.id} no se pudo guardar: ${msg}`);
      }

      const durationMs = Date.now() - startedAt;
      const stepStatus = errorMessage ? "failed" : "passed";

      const update: Record<string, unknown> = {
        status: stepStatus,
        error_message: errorMessage,
        screenshot_url: screenshotUrl,
        duration_ms: durationMs,
      };
      if (valueOverride !== undefined) {
        update.value = valueOverride;
      }
      if (selectorOverride !== undefined) {
        update.selector = selectorOverride;
      }

      await supabase.from("test_steps").update(update).eq("id", step.id);

      if (errorMessage) {
        caseFailed = true;
      }
    }
  } finally {
    await context.close();
  }

  const caseStatus = caseFailed ? "fallido" : "completado";
  await supabase.from("test_cases").update({ status: caseStatus }).eq("id", testCase.id);
  return caseStatus;
}

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
