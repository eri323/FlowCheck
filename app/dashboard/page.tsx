import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, Plus, Sparkles, Shield, Bolt } from "@/components/ui/icons";
import { StatTile } from "@/components/ui/stat-tile";
import { BreakdownBar } from "@/components/ui/breakdown-bar";
import { TEST_TYPES, TEST_TYPE_LABELS } from "@/lib/validation/test-run";
import { PageHeader } from "./_components/page-header";
import {
  RunListHeader,
  RunRow,
  toRunListItem,
  type TestRunRow,
} from "./runs/_components/run-list";

export const metadata = { title: "Resumen" };

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

  // Tendencia real: runs por día de los últimos 7 días naturales.
  const dayKey = (iso: string): string => iso.slice(0, 10);
  const today = new Date();
  const last7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().slice(0, 10));
  }
  const runsByDay = last7.map(
    (day) => rows.filter((r) => dayKey(r.created_at) === day).length,
  );

  const { data: userData } = await supabase.auth.getUser();
  const emailLocal = userData.user?.email?.split("@")[0] ?? "";
  const hour = today.getHours();
  const saludo =
    hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  const breakdown = TEST_TYPES.map((t) => {
    const ofType = rows.filter((r) => r.test_type === t);
    const passed = ofType.filter((r) => r.status === "completado").length;
    return {
      type: t,
      label: TEST_TYPE_LABELS[t],
      count: ofType.length,
      passRate:
        ofType.length > 0 ? Math.round((passed / ofType.length) * 100) : 0,
    };
  }).filter((b) => b.count > 0);
  const breakdownMax = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-accent-text">
          Resumen · hoy
        </p>
        <PageHeader
          title={emailLocal ? `${saludo}, ${emailLocal}.` : `${saludo}.`}
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
      </div>

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
          {/* Stat tiles */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
              <StatTile
                label="Total de runs"
                value={stats.total}
                tone="accent"
                trend={runsByDay}
              />
              <StatTile
                label="Completados"
                value={stats.completados}
                tone="success"
              />
              <StatTile label="Fallidos" value={stats.fallidos} tone="danger" />
              <StatTile label="En curso" value={stats.activos} tone="running" />
            </div>
          </div>

          {/* Two-column: recent runs + breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            {/* Left: recent runs */}
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

            {/* Right: breakdown by test type */}
            <section>
              <h2 className="text-sm font-semibold text-text">
                Por tipo de prueba
              </h2>
              <div className="mt-3 rounded-lg border border-border bg-surface px-5 py-4">
                <div className="flex flex-col gap-4">
                  {breakdown.map((b) => (
                    <BreakdownBar
                      key={b.type}
                      label={b.label}
                      value={b.count}
                      max={breakdownMax}
                      caption={`${b.passRate}%`}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-border bg-surface px-5 py-6 text-center opacity-70">
                <p className="text-sm font-medium text-muted">
                  Próximas tareas
                </p>
                <p className="mt-1 text-xs text-faint">
                  La cola de ejecuciones programadas estará disponible pronto.
                </p>
              </div>
            </section>
          </div>

          {/* Shortcuts */}
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold text-text">Atajos</h2>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ShortcutCard
                icon={Shield}
                title="Probar un login"
                description="Verifica credenciales y flujo de acceso en menos de un minuto."
              />
              <ShortcutCard
                icon={Bolt}
                title="Validar checkout"
                description="Carrito, pago de prueba y confirmación de orden end-to-end."
              />
              <ShortcutCard
                icon={Sparkles}
                title="Generar suite desde URL"
                description="Pega una URL y la IA propone y ejecuta pruebas automáticamente."
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

function ShortcutCard({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComponent;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <Link
      href="/dashboard/runs/new"
      className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors duration-150 hover:bg-surface-2"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-accent-subtle text-accent-text">
          <Icon size={15} />
        </span>
        <ArrowRight
          size={14}
          className="text-faint transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </div>
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
      </div>
    </Link>
  );
}
