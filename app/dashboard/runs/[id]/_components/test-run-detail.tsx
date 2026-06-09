"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { AlertCircle, Close, ImageIcon, Sparkles } from "@/components/ui/icons";
import { RunStatusBadge, StepStatusBadge } from "@/components/runs/run-status";
import { StepTimeline } from "@/components/runs/step-timeline";

type LogEntry = { ts: string; level: string; msg: string };

type TestRun = {
  id: string;
  status: string;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  logs: LogEntry[];
  js_error_count: number;
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

const LOG_LEVEL_CLASS: Record<string, string> = {
  ok: "text-success-text",
  err: "text-danger-text",
  warn: "text-warning-text",
  info: "text-muted",
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
  const [tab, setTab] = useState("pasos");

  const caseIdsRef = useRef<Set<string>>(
    new Set(initialCases.map((c) => c.id)),
  );

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
          if (
            payload.eventType === "UPDATE" ||
            payload.eventType === "INSERT"
          ) {
            setRun((prev) => ({
              ...prev,
              ...(payload.new as Partial<TestRun>),
            }));
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

  // Reconciliación: Realtime solo entrega eventos a partir de SUBSCRIBED.
  // refetch() relee el estado autoritativo y repuebla caseIdsRef.
  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();

    const [{ data: freshRun }, { data: freshCases }] = await Promise.all([
      supabase
        .from("test_runs")
        .select(
          "id, status, error_message, started_at, finished_at, created_at, logs, js_error_count",
        )
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

  useEffect(() => {
    const isActive = run.status === "pendiente" || run.status === "corriendo";

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

  useEffect(() => {
    if (!openScreenshot) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpenScreenshot(null);
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openScreenshot]);

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
    return (
      new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
    );
  }, [run.started_at, run.finished_at]);

  const isActive = run.status === "pendiente" || run.status === "corriendo";
  const pending = counts.pendiente + counts.corriendo;
  const progressPct =
    steps.length > 0
      ? Math.round(((counts.passed + counts.failed) / steps.length) * 100)
      : 0;

  // Último screenshot disponible — preview del modo en vivo.
  const latestShot = useMemo(() => {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i]!.screenshot_url) return steps[i]!.screenshot_url;
    }
    return null;
  }, [steps]);

  const allShots = steps.filter((s) => s.screenshot_url);

  const tabItems: TabItem[] = [
    { id: "pasos", label: "Pasos" },
    { id: "logs", label: "Logs", count: run.logs.length },
    { id: "screenshots", label: "Screenshots", count: allShots.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Run header con métricas */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 sm:px-5">
          <RunStatusBadge status={run.status} />
          <div className="flex items-center gap-5">
            <Stat label="passed" value={counts.passed} tone="success" />
            <Stat label="failed" value={counts.failed} tone="danger" />
            {counts.skipped > 0 ? (
              <Stat label="skipped" value={counts.skipped} tone="neutral" />
            ) : null}
            {pending > 0 ? (
              <Stat label="pendientes" value={pending} tone="running" />
            ) : null}
            <Stat
              label="errores js"
              value={run.js_error_count}
              tone={run.js_error_count > 0 ? "danger" : "neutral"}
            />
          </div>
          {totalDurationMs !== null ? (
            <span className="tabular text-faint ml-auto font-mono text-xs">
              {formatDuration(totalDurationMs)}
            </span>
          ) : null}
        </div>

        {isActive && steps.length > 0 ? (
          <div className="px-4 pb-4 sm:px-5">
            <div className="flex items-center justify-between gap-3 pb-1.5">
              <span className="text-faint font-mono text-[0.625rem] tracking-widest uppercase">
                progreso
              </span>
              <span className="tabular text-faint font-mono text-[0.625rem]">
                {counts.passed + counts.failed}/{steps.length} pasos
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso del run"
              className="bg-neutral-bg h-1.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-accent h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {run.error_message ? (
          <div className="border-border border-t px-4 py-3 sm:px-5">
            <p className="bg-danger-bg text-danger-text flex items-start gap-2 rounded-md px-3 py-2 text-sm">
              <AlertCircle size={15} className="mt-px shrink-0" />
              <span>{run.error_message}</span>
            </p>
          </div>
        ) : null}
      </Card>

      {/* Modo en vivo: preview + logs */}
      {isActive ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Card className="overflow-hidden">
            <header className="border-border bg-surface-2 text-muted border-b px-4 py-2.5 font-mono text-xs">
              vista previa · último paso
            </header>
            {latestShot ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={latestShot}
                alt="Última captura del run en vivo"
                className="bg-surface-2 max-h-[22rem] w-full object-contain"
              />
            ) : (
              <div className="text-muted flex items-center justify-center gap-2.5 px-6 py-16 text-sm">
                <Spinner size={15} />
                Esperando la primera captura.
              </div>
            )}
          </Card>
          <LogPanel logs={run.logs} live />
        </div>
      ) : null}

      {/* Empty state mientras arranca */}
      {cases.length === 0 ? (
        isActive ? (
          <Card className="text-muted flex items-center justify-center gap-2.5 px-6 py-12 text-sm">
            <Spinner size={15} />
            La IA está generando los casos de prueba.
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={Sparkles}
              title="Sin casos de prueba"
              description="Este run terminó sin que la IA generara casos. Revisa el mensaje de error o vuelve a intentarlo."
            />
          </Card>
        )
      ) : null}

      {/* Modo detalle: pestañas (solo cuando el run terminó) */}
      {!isActive && cases.length > 0 ? (
        <>
          <Tabs items={tabItems} value={tab} onValueChange={setTab} />

          {tab === "pasos"
            ? cases.map((tc) => {
                const list = stepsByCase.get(tc.id) ?? [];
                return (
                  <Card key={tc.id} className="overflow-hidden">
                    <header className="border-border flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
                      <div className="min-w-0">
                        <h3 className="text-text truncate text-sm font-semibold">
                          {tc.name}
                        </h3>
                        {tc.description ? (
                          <p className="text-muted mt-0.5 text-xs">
                            {tc.description}
                          </p>
                        ) : null}
                      </div>
                      <StepStatusBadge status={tc.status} />
                    </header>
                    {list.length === 0 ? (
                      <p className="text-faint px-4 py-4 text-xs sm:px-5">
                        Sin pasos registrados.
                      </p>
                    ) : (
                      <StepTimeline
                        steps={list}
                        onOpenScreenshot={setOpenScreenshot}
                      />
                    )}
                  </Card>
                );
              })
            : null}

          {tab === "logs" ? <LogPanel logs={run.logs} /> : null}

          {tab === "screenshots" ? (
            allShots.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allShots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setOpenScreenshot(s.screenshot_url)}
                    className="border-border bg-surface-2 overflow-hidden rounded-lg border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.screenshot_url ?? ""}
                      alt={`Captura del paso ${s.position + 1}`}
                      className="aspect-video w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState
                  icon={ImageIcon}
                  title="Sin capturas"
                  description="Este run no registró screenshots."
                />
              </Card>
            )
          ) : null}

        </>
      ) : null}

      {/* Lightbox de captura */}
      {openScreenshot ? (
        <div
          className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Captura del paso"
        >
          <button
            type="button"
            aria-label="Cerrar captura"
            onClick={() => setOpenScreenshot(null)}
            className="bg-bg/90 absolute inset-0 backdrop-blur-md"
          />
          <figure className="border-border bg-surface shadow-e3 relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border">
            <figcaption className="border-border bg-surface-2 flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <span className="text-muted inline-flex items-center gap-1.5 font-mono text-xs">
                <ImageIcon size={13} />
                captura del paso
              </span>
              <button
                type="button"
                onClick={() => setOpenScreenshot(null)}
                aria-label="Cerrar"
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md",
                  "text-muted hover:bg-elevated hover:text-text transition-colors",
                )}
              >
                <Close size={15} />
              </button>
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={openScreenshot}
              alt="Captura de pantalla del paso de la prueba"
              className="bg-surface-2 max-h-[80vh] w-full object-contain"
            />
          </figure>
        </div>
      ) : null}
    </div>
  );
}

const STAT_TONE: Record<string, string> = {
  success: "text-success-text",
  danger: "text-danger-text",
  running: "text-running-text",
  neutral: "text-faint",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "running" | "neutral";
}): React.JSX.Element {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("tabular text-sm font-semibold", STAT_TONE[tone])}>
        {value}
      </span>
      <span className="text-faint text-[0.6875rem] tracking-[0.05em] uppercase">
        {label}
      </span>
    </span>
  );
}

function LogPanel({
  logs,
  live,
}: {
  logs: LogEntry[];
  live?: boolean;
}): React.JSX.Element {
  return (
    <Card className="overflow-hidden">
      <header className="border-border bg-surface-2 flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-muted font-mono text-xs">
          {live ? "logs en vivo" : "logs"}
        </span>
        <span className="text-faint font-mono text-[0.6875rem]">
          {logs.length} líneas
        </span>
      </header>
      <div className="bg-surface max-h-[22rem] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-faint">Sin logs todavía.</p>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="text-faint shrink-0">
                {String(i + 1).padStart(3, "0")}
              </span>
              <span
                className={cn(
                  "shrink-0 uppercase",
                  LOG_LEVEL_CLASS[entry.level] ?? "text-muted",
                )}
              >
                [{entry.level}]
              </span>
              <span className="text-muted">{entry.msg}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
