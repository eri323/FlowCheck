"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Globe } from "@/components/ui/icons";

type Step = { action: string; target: string; dur: string };

const STEPS: Step[] = [
  { action: "goto", target: "demo-shop.com/login", dur: "0.82s" },
  { action: "fill", target: 'campo "correo electrónico"', dur: "0.21s" },
  { action: "fill", target: 'campo "contraseña"', dur: "0.18s" },
  { action: "click", target: "botón Iniciar sesión", dur: "1.04s" },
  { action: "expect", target: "redirige a /panel", dur: "0.39s" },
];

function Dot({ state }: { state: "done" | "running" | "idle" }) {
  if (state === "done") {
    return (
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-success-bg text-success-text">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="grid size-4 shrink-0 place-items-center">
        <span className="size-2.5 animate-pulse-dot rounded-full bg-running" />
      </span>
    );
  }
  return (
    <span className="grid size-4 shrink-0 place-items-center">
      <span className="size-2 rounded-full border border-border-strong" />
    </span>
  );
}

export function ReportMock({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  const total = STEPS.length;
  const [progress, setProgress] = useState(2);

  useEffect(() => {
    const done = progress >= total;
    const id = setTimeout(
      () => setProgress(done ? 0 : progress + 1),
      done ? 2200 : 1150,
    );
    return () => clearTimeout(id);
  }, [progress, total]);

  const finished = progress >= total;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface shadow-e3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
          <Globe size={13} />
          demo-shop.com
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
            finished
              ? "bg-success-bg text-success-text"
              : "bg-running-bg text-running-text",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              finished ? "bg-success" : "animate-pulse-dot bg-running",
            )}
          />
          {finished ? "Completado" : "Corriendo"}
        </span>
      </div>

      <div className="px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[0.8125rem] font-semibold text-text">
            Flujo de inicio de sesión
          </h3>
          <span className="font-mono text-[0.6875rem] text-faint">
            {Math.min(progress, total)}/{total} pasos
          </span>
        </div>

        <ol className="mt-3 space-y-0.5">
          {STEPS.map((step, i) => {
            const state =
              i < progress ? "done" : i === progress ? "running" : "idle";
            return (
              <li
                key={step.action + step.target}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-300",
                  state === "running" && "bg-running-bg/40",
                )}
              >
                <Dot state={state} />
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-accent-text">
                  {step.action}
                </code>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-[0.6875rem]",
                    state === "idle" ? "text-faint" : "text-muted",
                  )}
                >
                  {step.target}
                </span>
                <span className="tabular shrink-0 font-mono text-[0.6875rem] text-faint">
                  {state === "idle" ? "—" : step.dur}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-3.5 flex items-center gap-1.5 border-t border-border pt-3">
          {STEPS.map((step, i) => (
            <div
              key={step.action + i}
              className={cn(
                "flex h-9 flex-1 flex-col gap-1 rounded border p-1 transition-colors duration-300",
                i < progress
                  ? "border-border bg-surface-2"
                  : "border-dashed border-border",
              )}
              aria-hidden="true"
            >
              {i < progress ? (
                <>
                  <span className="h-1 w-2/3 rounded-full bg-border-strong" />
                  <span className="h-1 w-full rounded-full bg-border" />
                  <span className="h-1 w-1/2 rounded-full bg-border" />
                </>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[0.625rem] text-faint">
          una captura por paso · subidas a storage
        </p>
      </div>
    </div>
  );
}
