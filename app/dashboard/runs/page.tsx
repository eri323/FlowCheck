import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Runs } from "@/components/ui/icons";
import { PageHeader } from "../_components/page-header";
import { toRunListItem, type TestRunRow } from "./_components/run-list";
import { RunsTable } from "./_components/runs-table";

export const metadata = { title: "Test runs" };

export default async function RunsPage(): Promise<React.JSX.Element> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("test_runs")
    .select(
      "id, target_url, prompt, status, test_type, created_at, started_at, finished_at",
    )
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<TestRunRow[]>();

  const runs = (data ?? []).map(toRunListItem);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Test runs"
        description="Todas tus ejecuciones, con su estado y resultado."
      >
        <Link
          href="/dashboard/runs/new"
          className={buttonVariants({ size: "sm" })}
        >
          <Plus size={15} />
          Nuevo test run
        </Link>
      </PageHeader>

      {runs.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border">
          <EmptyState
            icon={Runs}
            title="Todavía no has lanzado ningún run"
            description="Cuando crees una prueba aparecerá aquí, con su estado en vivo y su historial."
            action={
              <Link
                href="/dashboard/runs/new"
                className={buttonVariants({ size: "sm" })}
              >
                <Plus size={15} />
                Crear test run
              </Link>
            }
          />
        </div>
      ) : (
        <RunsTable runs={runs} />
      )}
    </div>
  );
}
