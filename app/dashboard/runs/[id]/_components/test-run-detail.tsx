"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertCircle,
  Close,
  ImageIcon,
  Sparkles,
} from "@/components/ui/icons";
import { RunStatusBadge, StepStatusBadge } from "@/components/runs/run-status";

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

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <RunStatusBadge status={run.status} />
          <div className="flex items-center gap-4">
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
        {run.error_message ? (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-text">
            <AlertCircle size={15} className="mt-px shrink-0" />
            <span>{run.error_message}</span>
          </p>
        ) : null}
      </Card>

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
              <ol className="divide-y divide-border">
                {list.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    onOpenScreenshot={setOpenScreenshot}
                  />
                ))}
              </ol>
            )}
          </Card>
        );
      })}

      {openScreenshot ? (
        <div
          className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Captura del paso"
        >
          <button
            type="button"
            aria-label="Cerrar captura"
            onClick={() => setOpenScreenshot(null)}
            className="absolute inset-0 bg-bg/85 backdrop-blur-sm"
          />
          <figure className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-e3">
            <figcaption className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
                <ImageIcon size={13} />
                captura del paso
              </span>
              <button
                type="button"
                onClick={() => setOpenScreenshot(null)}
                aria-label="Cerrar"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
              >
                <Close size={15} />
              </button>
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={openScreenshot}
              alt="Captura de pantalla del paso de la prueba"
              className="max-h-[76vh] w-full bg-surface-2 object-contain"
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

const DOT_TONE: Record<string, string> = {
  passed: "bg-success",
  failed: "bg-danger",
  corriendo: "bg-running",
  skipped: "bg-faint",
  pendiente: "bg-warning",
};

function StepRow({
  step,
  onOpenScreenshot,
}: {
  step: TestStep;
  onOpenScreenshot: (url: string) => void;
}): React.JSX.Element {
  const adaptive = step.selector?.startsWith("[adaptive]") ?? false;
  const selectorText = adaptive
    ? step.selector?.replace(/^\[adaptive\]\s*/, "")
    : step.selector;

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span
        className={cn(
          "mt-[5px] size-2 shrink-0 rounded-full",
          DOT_TONE[step.status] ?? "bg-border-strong",
          step.status === "corriendo" && "animate-pulse-dot",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-accent-text">
            {step.action}
          </code>
          {adaptive ? (
            <Badge tone="accent">adaptativo</Badge>
          ) : null}
          {selectorText ? (
            <span className="min-w-0 truncate font-mono text-xs text-muted">
              {selectorText}
            </span>
          ) : null}
          {step.value ? (
            <span className="min-w-0 truncate font-mono text-xs text-faint">
              → {step.value}
            </span>
          ) : null}
          {step.duration_ms !== null ? (
            <span className="tabular ml-auto shrink-0 font-mono text-[0.6875rem] text-faint">
              {step.duration_ms} ms
            </span>
          ) : null}
        </div>
        {step.error_message ? (
          <p className="mt-1.5 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger-text">
            {step.error_message}
          </p>
        ) : null}
        {step.screenshot_url ? (
          <button
            type="button"
            onClick={() => onOpenScreenshot(step.screenshot_url as string)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent-text transition-opacity hover:opacity-80"
          >
            <ImageIcon size={12} />
            Ver captura
          </button>
        ) : null}
      </div>
    </li>
  );
}
