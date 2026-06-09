import {
  devices,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "playwright-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { launchBrowser } from "./chromium-launch";
import { uploadScreenshot } from "./upload-screenshot";
import { assertSafeUrl, installSsrfGuard } from "./safe-url";
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
import {
  executeSearch,
  findSearchField,
  isSearchFillSelector,
  isSearchSubmitSelector,
} from "./adaptive-search";
import { clickAdaptive, verifyPageHealthy } from "./adaptive-navegacion";
import {
  fillAndSubmitForm,
  isFormSubmitSelector,
  parseFields,
} from "./adaptive-formulario";
import {
  findConfirmPasswordField,
  findNameField,
  isConfirmPasswordSelector,
  isNameFillSelector,
  isRegisterSubmitSelector,
  registerAndVerify,
} from "./adaptive-registro";

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
  /** Último valor llenado — usado como query en flujos de búsqueda. */
  searchQuery?: string;
  /** Pares label:value del formulario (test_data.fields), para el submit. */
  formFields?: { label: string; value: string }[];
  /** test_data del registro, para el submit adaptativo. */
  registroData?: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
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
      console.warn(
        `No se pudo volcar logs del run ${testRunId}: ${error.message}`,
      );
    }
  }
}

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
    throw new TestExecutionError(
      "El test_run no tiene test_cases para ejecutar",
    );
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

  // Navegación es un smoke test: su test_data es {} vacío, así que cualquier
  // expect_text de Gemini es una aserción alucinada, no una expectativa del
  // usuario. Por eso se reemplaza TODO expect_* por verifyPageHealthy a propósito.
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

  if (!isExpectAction) {
    ctx.inVerificationWindow = false;
  }

  switch (step.action) {
    case "goto": {
      if (!step.value)
        throw new Error("La acción 'goto' requiere un value (URL)");
      await assertSafeUrl(step.value);
      await page.goto(step.value, {
        timeout: STEP_TIMEOUT_MS,
        waitUntil: "load",
      });
      return {};
    }
    case "click": {
      if (!step.selector)
        throw new Error("La acción 'click' requiere un selector");
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
      if (
        ctx.testType === "registro" &&
        isRegisterSubmitSelector(step.selector)
      ) {
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
            `Registro adaptativo falló: ${outcome.reason} (URL final: ${outcome.finalUrl})`,
          );
        }
        ctx.inVerificationWindow = true;
        return {
          valueOverride: outcome.finalUrl,
          selectorOverride: "[adaptive] submit registro",
        };
      }
      if (
        ctx.testType === "busqueda" &&
        isSearchSubmitSelector(step.selector)
      ) {
        const query = ctx.searchQuery ?? "";
        const outcome = await executeSearch(page, query, STEP_TIMEOUT_MS);
        if (!outcome.success) {
          throw new Error(
            `Búsqueda adaptativa falló: ${outcome.reason} (URL final: ${outcome.finalUrl})`,
          );
        }
        return {
          valueOverride: outcome.finalUrl,
          selectorOverride: outcome.resultsFound
            ? "[adaptive] submit búsqueda (con resultados)"
            : "[adaptive] submit búsqueda (sin resultados confirmados)",
        };
      }
      if (ctx.testType === "navegacion") {
        await clickAdaptive(page, step.selector, STEP_TIMEOUT_MS);
        return { selectorOverride: "[adaptive] click tolerante" };
      }
      if (
        ctx.testType === "formulario" &&
        isFormSubmitSelector(step.selector)
      ) {
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
      await page.locator(step.selector).click({ timeout: STEP_TIMEOUT_MS });
      return {};
    }
    case "fill": {
      if (!step.selector)
        throw new Error("La acción 'fill' requiere un selector");
      if (step.value === null)
        throw new Error("La acción 'fill' requiere un value");
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
      if (ctx.testType === "busqueda") {
        // El último valor llenado es el query que usará el submit adaptativo.
        ctx.searchQuery = step.value;
        if (isSearchFillSelector(step.selector)) {
          const field = await findSearchField(page);
          await field.fill(step.value, { timeout: STEP_TIMEOUT_MS });
          return { selectorOverride: "[adaptive] campo de búsqueda" };
        }
      }
      await page
        .locator(step.selector)
        .fill(step.value, { timeout: STEP_TIMEOUT_MS });
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
      if (!step.value)
        throw new Error("La acción 'expect_text' requiere un value");
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
      const text =
        (await locator.textContent({ timeout: STEP_TIMEOUT_MS })) ?? "";
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
      if (!step.value)
        throw new Error("La acción 'expect_url' requiere un value");
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
  log: RunLog,
  jsErrors: { count: number },
  formFieldsRaw: string | undefined,
  registroData:
    | { name: string; email: string; password: string; confirmPassword: string }
    | undefined,
): Promise<"completado" | "fallido"> {
  await supabase
    .from("test_cases")
    .update({ status: "corriendo" })
    .eq("id", testCase.id);

  const context = await browser.newContext(contextOptions);
  await installSsrfGuard(context);
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
  const loginCtx: LoginRunContext = {
    testType,
    inVerificationWindow: false,
    formFields: formFieldsRaw ? parseFields(formFieldsRaw) : undefined,
    registroData,
  };
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
          error instanceof Error
            ? error.message
            : "Error desconocido en el paso";
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
          error instanceof Error
            ? error.message
            : "Error desconocido al guardar screenshot";
        console.warn(
          `Screenshot del paso ${step.id} no se pudo guardar: ${msg}`,
        );
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
      log.add(
        errorMessage ? "err" : "ok",
        `paso ${step.position + 1} · ${step.action} · ${stepStatus}` +
          (errorMessage ? ` — ${errorMessage}` : ` · ${durationMs}ms`),
      );
      await log.flush(supabase, testRunId);

      if (errorMessage) {
        caseFailed = true;
      }
    }
  } finally {
    await context.close();
  }

  const caseStatus = caseFailed ? "fallido" : "completado";
  await supabase
    .from("test_cases")
    .update({ status: caseStatus })
    .eq("id", testCase.id);
  return caseStatus;
}

export type ExecuteTestRunOptions = {
  testType?: TestType;
  device?: "desktop" | "mobile";
  formFieldsRaw?: string;
  registroData?: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
};

export async function executeTestRun(
  supabase: SupabaseClient,
  testRunId: string,
  opts: ExecuteTestRunOptions = {},
): Promise<"completado" | "fallido"> {
  const { testType, formFieldsRaw, registroData } = opts;
  const device = opts.device ?? "desktop";
  const cases = await loadCasesForRun(supabase, testRunId);

  const contextOptions: BrowserContextOptions =
    device === "mobile" ? devices["Pixel 5"] : {};

  const log = new RunLog();
  const jsErrors = { count: 0 };
  log.add(
    "info",
    `ejecución iniciada · device=${device} · ${cases.length} casos`,
  );
  await log.flush(supabase, testRunId);

  const browser = await launchBrowser();
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
        formFieldsRaw,
        registroData,
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
