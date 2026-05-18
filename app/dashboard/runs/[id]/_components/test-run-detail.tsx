"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertCircle,
  Close,
  ImageIcon,
  Sparkles,
} from "@/components/ui/icons";
import { RunStatusBadge, StepStatusBadge } from "@/components/runs/run-status";
import { StepTimeline } from "@/components/runs/step-timeline";

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

  // Cierra el visor de captura con Escape y bloquea el scroll del fondo.
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
      new Date(run.finished_at).getTime() -
      new Date(run.started_at).getTime()
    );
  }, [run.started_at, run.finished_at]);

  const isActive = run.status === "pendiente" || run.status === "corriendo";
  const pending = counts.pendiente + counts.corriendo;

  // Progress bar: fraction of completed steps (passed + failed) out of total.
  const progressPct =
    steps.length > 0
      ? Math.round(((counts.passed + counts.failed) / steps.length) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Run header ─────────────────────────────────────────────────── */}
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
          </div>

          {totalDurationMs !== null ? (
            <span className="tabular ml-auto font-mono text-xs text-faint">
              {formatDuration(totalDurationMs)}
            </span>
          ) : null}
        </div>

        {/* Live progress bar — only while the run is active and has steps */}
        {isActive && steps.length > 0 ? (
          <div className="px-4 pb-4 sm:px-5">
            <div className="flex items-center justify-between gap-3 pb-1.5">
              <span className="font-mono text-[0.625rem] uppercase tracking-widest text-faint">
                progreso
              </span>
              <span className="tabular font-mono text-[0.625rem] text-faint">
                {counts.passed + counts.failed}/{steps.length} pasos
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-bg">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {run.error_message ? (
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <p className="flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-text">
              <AlertCircle size={15} className="mt-px shrink-0" />
              <span>{run.error_message}</span>
            </p>
          </div>
        ) : null}
      </Card>

      {/* ── Empty state while run is starting ─────────────────────────── */}
      {cases.length === 0 ? (
        isActive ? (
          <Card className="flex items-center justify-center gap-2.5 px-6 py-12 text-sm text-muted">
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

      {/* ── Per-case cards ─────────────────────────────────────────────── */}
      {cases.map((tc) => {
        const list = stepsByCase.get(tc.id) ?? [];
        return (
          <Card key={tc.id} className="overflow-hidden">
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-text">
                  {tc.name}
                </h3>
                {tc.description ? (
                  <p className="mt-0.5 text-xs text-muted">{tc.description}</p>
                ) : null}
              </div>
              <StepStatusBadge status={tc.status} />
            </header>
            {list.length === 0 ? (
              <p className="px-4 py-4 text-xs text-faint sm:px-5">
                Sin pasos registrados todavía.
              </p>
            ) : (
              <StepTimeline steps={list} onOpenScreenshot={setOpenScreenshot} />
            )}
          </Card>
        );
      })}

      {/* ── Screenshot lightbox ────────────────────────────────────────── */}
      {openScreenshot ? (
        <div
          className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Captura del paso"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar captura"
            onClick={() => setOpenScreenshot(null)}
            className="absolute inset-0 bg-bg/90 backdrop-blur-md"
          />

          {/* Viewer panel */}
          <figure className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-e3">
            {/* Toolbar */}
            <figcaption className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
                <ImageIcon size={13} />
                captura del paso
              </span>
              <button
                type="button"
                onClick={() => setOpenScreenshot(null)}
                aria-label="Cerrar"
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md",
                  "text-muted transition-colors hover:bg-elevated hover:text-text",
                )}
              >
                <Close size={15} />
              </button>
            </figcaption>

            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={openScreenshot}
              alt="Captura de pantalla del paso de la prueba"
              className="max-h-[80vh] w-full bg-surface-2 object-contain"
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
      <span className="text-[0.6875rem] uppercase tracking-[0.05em] text-faint">
        {label}
      </span>
    </span>
  );
}
