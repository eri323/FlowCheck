import { createSupabaseAdminClient } from "../lib/supabase/admin";
import {
  generateTestPlan,
  TestPlanGenerationError,
  type GenerateTestPlanInput,
} from "../lib/gemini/generate-test-plan";
import { executeTestRun } from "../lib/playwright/execute-test-run";
import type { TestCaseDraft, TestStepDraft } from "../lib/validation/test-plan";
import type { TestType } from "../lib/validation/test-run";

type TestRunRow = {
  id: string;
  user_id: string;
  target_url: string;
  prompt: string | null;
  status: string;
  test_type: TestType;
  test_data: Record<string, unknown>;
};

const GENERATION_TIMEOUT_MS = 90_000;
const EXECUTION_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TestPlanGenerationError(`${label} excedió el timeout de ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function persistTestPlan(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  testRunId: string,
  cases: TestCaseDraft[],
): Promise<void> {
  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]!;
    const { data: insertedCase, error: caseError } = await supabase
      .from("test_cases")
      .insert({
        test_run_id: testRunId,
        name: testCase.name,
        description: testCase.description ?? null,
        position: i,
      })
      .select("id")
      .single();

    if (caseError || !insertedCase) {
      throw new Error(
        `No se pudo guardar el test_case ${i}: ${caseError?.message ?? "respuesta vacía"}`,
      );
    }

    const stepsRows = testCase.steps.map((step: TestStepDraft, position: number) => ({
      test_case_id: insertedCase.id,
      position,
      action: step.action,
      selector: step.selector ?? null,
      value: step.value ?? null,
    }));

    const { error: stepsError } = await supabase.from("test_steps").insert(stepsRows);
    if (stepsError) {
      throw new Error(
        `No se pudieron guardar los test_steps del caso ${i}: ${stepsError.message}`,
      );
    }
  }
}

function buildGeneratorInput(testRun: TestRunRow): GenerateTestPlanInput {
  const base = {
    targetUrl: testRun.target_url,
    extraInstruction: testRun.prompt ?? undefined,
  };
  const data = testRun.test_data;

  switch (testRun.test_type) {
    case "login":
      return {
        ...base,
        testType: "login",
        testData: {
          email: String(data.email ?? ""),
          password: String(data.password ?? ""),
        },
      };
    case "registro":
      return {
        ...base,
        testType: "registro",
        testData: {
          name: String(data.name ?? ""),
          email: String(data.email ?? ""),
          password: String(data.password ?? ""),
          confirmPassword: String(data.confirmPassword ?? ""),
        },
      };
    case "busqueda":
      return {
        ...base,
        testType: "busqueda",
        testData: {
          query: String(data.query ?? ""),
          expectedResult: data.expectedResult ? String(data.expectedResult) : undefined,
        },
      };
    case "navegacion":
      return { ...base, testType: "navegacion", testData: {} };
    case "formulario":
      return {
        ...base,
        testType: "formulario",
        testData: { fields: String(data.fields ?? "") },
      };
    case "ecommerce":
      return {
        ...base,
        testType: "ecommerce",
        testData: {
          email: String(data.email ?? ""),
          card: String(data.card ?? ""),
          expiry: String(data.expiry ?? ""),
          cvc: String(data.cvc ?? ""),
        },
      };
  }
}

export type ProcessTestRunResult = {
  status: "completado" | "fallido";
  errorMessage?: string;
  stepCounts: { passed: number; failed: number; skipped: number };
};

async function collectStepCounts(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  testRunId: string,
): Promise<ProcessTestRunResult["stepCounts"]> {
  const { data } = await supabase
    .from("test_steps")
    .select("status, test_cases!inner(test_run_id)")
    .eq("test_cases.test_run_id", testRunId);

  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const row of (data ?? []) as { status: string }[]) {
    if (row.status === "passed") counts.passed += 1;
    else if (row.status === "failed") counts.failed += 1;
    else if (row.status === "skipped") counts.skipped += 1;
  }
  return counts;
}

export async function processTestRun(testRunId: string): Promise<ProcessTestRunResult> {
  const supabase = createSupabaseAdminClient();

  const { data: rawTestRun, error: fetchError } = await supabase
    .from("test_runs")
    .select("id, user_id, target_url, prompt, status, test_type, test_data")
    .eq("id", testRunId)
    .single();

  if (fetchError || !rawTestRun) {
    throw new Error(
      `No se encontró el test_run ${testRunId}: ${fetchError?.message ?? "no existe"}`,
    );
  }

  const testRun = rawTestRun as TestRunRow;

  if (testRun.status !== "pendiente") {
    throw new Error(
      `El test_run ${testRunId} no está en estado pendiente (actual: ${testRun.status})`,
    );
  }

  const { error: lockError } = await supabase
    .from("test_runs")
    .update({ status: "corriendo", started_at: new Date().toISOString() })
    .eq("id", testRunId);

  if (lockError) {
    throw new Error(`No se pudo marcar el test_run como corriendo: ${lockError.message}`);
  }

  try {
    const generatorInput = buildGeneratorInput(testRun);
    const plan = await withTimeout(
      generateTestPlan(generatorInput),
      GENERATION_TIMEOUT_MS,
      "Generación del plan con Gemini",
    );

    await persistTestPlan(supabase, testRunId, plan.test_cases);

    const finalStatus = await withTimeout(
      executeTestRun(supabase, testRunId, testRun.test_type),
      EXECUTION_TIMEOUT_MS,
      "Ejecución del plan con Playwright",
    );

    await supabase
      .from("test_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
      })
      .eq("id", testRunId);

    const stepCounts = await collectStepCounts(supabase, testRunId);
    return { status: finalStatus, stepCounts };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al procesar el test_run";

    await supabase
      .from("test_runs")
      .update({
        status: "fallido",
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", testRunId);

    throw error;
  }
}
