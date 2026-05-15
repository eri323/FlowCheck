"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TestRun = {
  id: string;
  status: string;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type TestCase = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  status: string;
};

type TestStep = {
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

type Props = {
  runId: string;
  initialRun: TestRun;
  initialCases: TestCase[];
  initialSteps: TestStep[];
};

export function TestRunDetail({
  runId,
  initialRun,
  initialCases,
  initialSteps,
}: Props): React.JSX.Element {
  const [run, setRun] = useState<TestRun>(initialRun);
  const [cases, setCases] = useState<TestCase[]>(initialCases);
  const [steps, setSteps] = useState<TestStep[]>(initialSteps);
  const [openScreenshot, setOpenScreenshot] = useState<string | null>(null);

  const caseIdsRef = useRef<Set<string>>(new Set(initialCases.map((c) => c.id)));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`test_run_${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            setRun((prev) => ({ ...prev, ...(payload.new as Partial<TestRun>) }));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_cases",
          filter: `test_run_id=eq.${runId}`,
        },
        (payload) => {
          const row = payload.new as TestCase | undefined;
          if (!row) return;
          caseIdsRef.current.add(row.id);
          setCases((prev) => {
            const exists = prev.some((c) => c.id === row.id);
            if (exists) {
              return prev.map((c) => (c.id === row.id ? { ...c, ...row } : c));
            }
            return [...prev, row].sort((a, b) => a.position - b.position);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_steps",
        },
        (payload) => {
          const row = payload.new as TestStep | undefined;
          if (!row || !caseIdsRef.current.has(row.test_case_id)) return;
          setSteps((prev) => {
            const exists = prev.some((s) => s.id === row.id);
            if (exists) {
              return prev.map((s) => (s.id === row.id ? { ...s, ...row } : s));
            }
            return [...prev, row];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  // Reconciliación: Realtime (postgres_changes) solo entrega eventos a partir
  // del momento en que el canal queda SUBSCRIBED. Todo INSERT/UPDATE ocurrido
  // entre el render del servidor y esa suscripción se pierde para siempre.
  // refetch() relee el estado autoritativo desde la DB y repuebla caseIdsRef,
  // que es el filtro del que dependen los eventos de test_steps.
  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();

    const [{ data: freshRun }, { data: freshCases }] = await Promise.all([
      supabase
        .from("test_runs")
        .select("id, status, error_message, started_at, finished_at, created_at")
        .eq("id", runId)
        .maybeSingle<TestRun>(),
      supabase
        .from("test_cases")
        .select("id, name, description, position, status")
        .eq("test_run_id", runId)
        .order("position", { ascending: true })
        .returns<TestCase[]>(),
    ]);

    if (freshRun) setRun(freshRun);

    if (freshCases) {
      caseIdsRef.current = new Set(freshCases.map((c) => c.id));
      setCases(freshCases);

      if (freshCases.length > 0) {
        const { data: freshSteps } = await supabase
          .from("test_steps")
          .select(
            "id, test_case_id, position, action, selector, value, status, error_message, screenshot_url, duration_ms",
          )
          .in(
            "test_case_id",
            freshCases.map((c) => c.id),
          )
          .order("position", { ascending: true })
          .returns<TestStep[]>();
        if (freshSteps) setSteps(freshSteps);
      }
    }
  }, [runId]);

  // Cierra el hueco de la suscripción y sirve de respaldo si el WebSocket se
  // cae a mitad del run: refetch al montar, en cada cambio de estado (incluida
  // la transición a un estado final) y cada 3s mientras el run sigue activo.
  useEffect(() => {
    const isActive = run.status === "pendiente" || run.status === "corriendo";

    // Diferido un tick para no encadenar renders dentro del efecto.
    const initial = setTimeout(() => {
      void refetch();
    }, 0);

    if (!isActive) {
      return () => clearTimeout(initial);
    }

    const interval = setInterval(() => {
      void refetch();
    }, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [run.status, refetch]);

  const stepsByCase = useMemo(() => {
    const map = new Map<string, TestStep[]>();
    for (const step of steps) {
      const list = map.get(step.test_case_id) ?? [];
      list.push(step);
      map.set(step.test_case_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [steps]);

  const counts = useMemo(() => {
    const c = { passed: 0, failed: 0, skipped: 0, pendiente: 0, corriendo: 0 };
    for (const s of steps) {
      if (s.status === "passed") c.passed += 1;
      else if (s.status === "failed") c.failed += 1;
      else if (s.status === "skipped") c.skipped += 1;
      else if (s.status === "pendiente") c.pendiente += 1;
      else if (s.status === "corriendo") c.corriendo += 1;
    }
    return c;
  }, [steps]);

  const totalDurationMs = useMemo(() => {
    if (!run.started_at || !run.finished_at) return null;
    return new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  }, [run.started_at, run.finished_at]);

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${runStatusClass(run.status)}`}
          >
            {run.status === "corriendo" ? <Spinner /> : null}
            {run.status}
          </span>
          <Stat label="passed" value={counts.passed} tone="emerald" />
          <Stat label="failed" value={counts.failed} tone="red" />
          {counts.skipped > 0 ? (
            <Stat label="skipped" value={counts.skipped} tone="zinc" />
          ) : null}
          {counts.corriendo + counts.pendiente > 0 ? (
            <Stat
              label="pendientes"
              value={counts.pendiente + counts.corriendo}
              tone="amber"
            />
          ) : null}
          {totalDurationMs !== null ? (
            <span className="ml-auto text-sm text-zinc-500">
              Duración: {formatDuration(totalDurationMs)}
            </span>
          ) : null}
        </div>
        {run.error_message ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {run.error_message}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {cases.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            La IA todavía no generó casos de prueba para este run.
          </p>
        ) : null}
        {cases.map((tc) => {
          const list = stepsByCase.get(tc.id) ?? [];
          return (
            <div
              key={tc.id}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{tc.name}</h3>
                  {tc.description ? (
                    <p className="mt-0.5 text-sm text-zinc-500">{tc.description}</p>
                  ) : null}
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${runStatusClass(tc.status)}`}
                >
                  {tc.status}
                </span>
              </header>
              <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {list.map((step) => (
                  <li key={step.id} className="px-6 py-3">
                    <div className="flex items-start gap-3">
                      <StatusDot status={step.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {step.action}
                          </code>
                          {step.selector ? (
                            <span className="truncate text-xs text-zinc-500">
                              {step.selector}
                            </span>
                          ) : null}
                          {step.value ? (
                            <span className="truncate text-xs text-zinc-500">
                              → {step.value}
                            </span>
                          ) : null}
                          {step.duration_ms !== null ? (
                            <span className="ml-auto whitespace-nowrap text-xs text-zinc-400">
                              {step.duration_ms} ms
                            </span>
                          ) : null}
                        </div>
                        {step.error_message ? (
                          <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                            {step.error_message}
                          </p>
                        ) : null}
                        {step.screenshot_url ? (
                          <button
                            type="button"
                            onClick={() => setOpenScreenshot(step.screenshot_url)}
                            className="mt-1 text-xs text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            ver screenshot
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      {openScreenshot ? (
        <button
          type="button"
          onClick={() => setOpenScreenshot(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          aria-label="Cerrar screenshot"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={openScreenshot}
            alt="Screenshot del paso"
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
          />
        </button>
      ) : null}
    </>
  );
}

function runStatusClass(status: string): string {
  switch (status) {
    case "completado":
    case "passed":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "fallido":
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "corriendo":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "skipped":
    case "cancelado":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
}

function StatusDot({ status }: { status: string }): React.JSX.Element {
  const map: Record<string, string> = {
    passed: "bg-emerald-500",
    failed: "bg-red-500",
    corriendo: "bg-blue-500 animate-pulse",
    skipped: "bg-zinc-400",
    pendiente: "bg-amber-400",
  };
  const cls = map[status] ?? "bg-zinc-300";
  return <span className={`mt-1.5 size-2 shrink-0 rounded-full ${cls}`} />;
}

function Spinner(): React.JSX.Element {
  return (
    <span
      className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "red" | "zinc" | "amber";
}): React.JSX.Element {
  const toneClass = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
    zinc: "text-zinc-600 dark:text-zinc-400",
    amber: "text-amber-700 dark:text-amber-300",
  }[tone];
  return (
    <span className={`text-sm ${toneClass}`}>
      <span className="font-semibold">{value}</span>{" "}
      <span className="text-xs uppercase tracking-wide">{label}</span>
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}
