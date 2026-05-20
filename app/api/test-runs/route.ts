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
