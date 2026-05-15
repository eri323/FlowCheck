import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TEST_TYPE_LABELS, type TestType } from "@/lib/validation/test-run";
import { TestRunDetail } from "./_components/test-run-detail";

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
};

type TestCaseRow = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  status: string;
};

type TestStepRow = {
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

export default async function TestRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: testRun } = await supabase
    .from("test_runs")
    .select(
      "id, target_url, prompt, status, test_type, error_message, started_at, finished_at, created_at",
    )
    .eq("id", id)
    .maybeSingle<TestRunRow>();

  if (!testRun) {
    notFound();
  }

  const { data: cases } = await supabase
    .from("test_cases")
    .select("id, name, description, position, status")
    .eq("test_run_id", id)
    .order("position", { ascending: true })
    .returns<TestCaseRow[]>();

  const caseIds = (cases ?? []).map((c) => c.id);
  const { data: steps } = caseIds.length
    ? await supabase
        .from("test_steps")
        .select(
          "id, test_case_id, position, action, selector, value, status, error_message, screenshot_url, duration_ms",
        )
        .in("test_case_id", caseIds)
        .order("position", { ascending: true })
        .returns<TestStepRow[]>()
    : { data: [] as TestStepRow[] };

  return (
    <section className="space-y-6">
      <nav className="text-sm">
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-700">
          ← Volver al dashboard
        </Link>
      </nav>

      <header className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {TEST_TYPE_LABELS[testRun.test_type]}
              </span>
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {testRun.target_url}
              </h1>
            </div>
            {testRun.prompt ? (
              <p className="mt-2 text-sm text-zinc-500">{testRun.prompt}</p>
            ) : null}
          </div>
        </div>
      </header>

      <TestRunDetail
        runId={testRun.id}
        initialRun={testRun}
        initialCases={cases ?? []}
        initialSteps={steps ?? []}
      />
    </section>
  );
}
