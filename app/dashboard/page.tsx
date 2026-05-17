import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, Plus, Sparkles } from "@/components/ui/icons";
import { PageHeader } from "./_components/page-header";
import {
  RunListHeader,
  RunRow,
  toRunListItem,
  type TestRunRow,
} from "./runs/_components/run-list";

export const metadata = { title: "Resumen" };

type StatTone = "accent" | "success" | "danger" | "running";

const DOT: Record<StatTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  running: "bg-running",
};

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: StatTone;
}): React.JSX.Element {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", DOT[tone])} />
        <p className="text-xs text-muted">{label}</p>
      </div>
      <p className="tabular mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight text-text">
        {value}
      </p>
    </div>
  );
}

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("test_runs")
    .select(
      "id, target_url, prompt, status, test_type, created_at, started_at, finished_at",
    )
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<TestRunRow[]>();

  const rows = data ?? [];
  const stats = {
    total: rows.length,
    completados: rows.filter((r) => r.status === "completado").length,
    fallidos: rows.filter((r) => r.status === "fallido").length,
    activos: rows.filter(
      (r) => r.status === "pendiente" || r.status === "corriendo",
    ).length,
  };
  const recent = rows.slice(0, 6).map(toRunListItem);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Resumen"
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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Sparkles}
            title="Aún no hay test runs"
            description="Describe un flujo en lenguaje natural y deja que la IA genere y ejecute la primera prueba."
            action={
              <Link
                href="/dashboard/runs/new"
                className={buttonVariants({ size: "sm" })}
              >
                <Plus size={15} />
                Crear el primero
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
              <StatCell label="Total de runs" value={stats.total} tone="accent" />
              <StatCell
                label="Completados"
                value={stats.completados}
                tone="success"
              />
              <StatCell label="Fallidos" value={stats.fallidos} tone="danger" />
              <StatCell label="En curso" value={stats.activos} tone="running" />
            </div>
          </div>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-text">
                Actividad reciente
              </h2>
              <Link
                href="/dashboard/runs"
                className="group inline-flex items-center gap-1 text-xs font-medium text-accent-text"
              >
                Ver todos
                <ArrowRight
                  size={13}
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
              <RunListHeader />
              <div className="divide-y divide-border">
                {recent.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
