import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TEST_TYPE_LABELS, type TestType } from "@/lib/validation/test-run";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "@/components/ui/icons";
import { TestRunDetail } from "./_components/test-run-detail";

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

export const metadata = { title: "Detalle del run" };

export default async function TestRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: testRun } = await supabase
    .from("test_runs")
    .select(
      "id, target_url, prompt, status, test_type, error_message, started_at, finished_at, created_at, logs, js_error_count",
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
    <div className="flex flex-col gap-5">
      <Link
        href="/dashboard/runs"
        className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm transition-colors duration-150"
      >
        <ArrowLeft size={15} />
        Test runs
      </Link>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{TEST_TYPE_LABELS[testRun.test_type]}</Badge>
              <span className="text-faint font-mono text-xs">
                {formatDateTime(testRun.created_at)}
              </span>
            </div>
            <h1 className="text-text mt-2 truncate font-mono text-lg font-semibold tracking-tight">
              {testRun.target_url}
            </h1>
            {testRun.prompt ? (
              <p className="text-muted mt-1.5 max-w-2xl text-sm text-pretty">
                {testRun.prompt}
              </p>
            ) : null}
          </div>
          <a
            href={testRun.target_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Abrir URL
            <ExternalLink size={14} />
          </a>
        </div>
      </Card>

      <TestRunDetail
        runId={testRun.id}
        initialRun={testRun}
        initialCases={cases ?? []}
        initialSteps={steps ?? []}
      />
    </div>
  );
}
