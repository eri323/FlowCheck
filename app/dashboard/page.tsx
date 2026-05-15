import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TEST_TYPE_LABELS, type TestType } from "@/lib/validation/test-run";
import { NewTestRunForm } from "./_components/new-test-run-form";

type TestRunSummary = {
  id: string;
  target_url: string;
  prompt: string | null;
  status: string;
  created_at: string;
  test_type: TestType;
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: testRuns } = await supabase
    .from("test_runs")
    .select("id, target_url, prompt, status, created_at, test_type")
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<TestRunSummary[]>();

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-zinc-500">
          Bienvenido{user?.email ? `, ${user.email}` : ""}. Elige el tipo de prueba y
          completa los campos. La IA generará el plan y el worker lo ejecutará.
        </p>
      </header>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold tracking-tight">Nuevo test run</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Los campos sensibles se almacenan estructurados y separados de tu
          instrucción libre.
        </p>
        <div className="mt-4">
          <NewTestRunForm />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold tracking-tight">Historial reciente</h2>
        {testRuns && testRuns.length > 0 ? (
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {testRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/dashboard/runs/${run.id}`}
                  className="flex items-center justify-between gap-3 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {TEST_TYPE_LABELS[run.test_type]}
                      </span>
                      <p className="truncate text-sm font-medium">{run.target_url}</p>
                    </div>
                    {run.prompt ? (
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {run.prompt}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`ml-4 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(run.status)}`}
                  >
                    {run.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            Aún no hay test runs. Crea el primero arriba.
          </p>
        )}
      </div>
    </section>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "completado":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "fallido":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "corriendo":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "cancelado":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
}
