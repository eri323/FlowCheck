import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ImageIcon } from "@/components/ui/icons";

export type TimelineStep = {
  id: string;
  position: number;
  action: string;
  selector: string | null;
  value: string | null;
  status: string;
  error_message: string | null;
  screenshot_url: string | null;
  duration_ms: number | null;
};

const MARKER: Record<string, string> = {
  passed: "border-success bg-success",
  failed: "border-danger bg-danger",
  corriendo: "border-running bg-bg",
  pendiente: "border-border-strong bg-bg",
  skipped: "border-border-strong bg-surface-2",
};

export function StepTimeline({
  steps,
  onOpenScreenshot,
}: {
  steps: TimelineStep[];
  onOpenScreenshot: (url: string) => void;
}): React.JSX.Element {
  return (
    <ol className="flex flex-col px-4 py-2 sm:px-5">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const adaptive = step.selector?.startsWith("[adaptive]") ?? false;
        const selectorText = adaptive
          ? step.selector?.replace(/^\[adaptive\]\s*/, "")
          : step.selector;
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-2 size-3 shrink-0 rounded-full border-2",
                  MARKER[step.status] ?? "border-border-strong bg-surface-2",
                  step.status === "corriendo" && "animate-pulse-dot",
                )}
              />
              {!last ? <span className="w-px flex-1 bg-border" /> : null}
            </div>
            <div className="min-w-0 flex-1 pb-4 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-accent-text">
                  {step.action}
                </code>
                {adaptive ? <Badge tone="accent">adaptativo</Badge> : null}
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
                  onClick={() =>
                    onOpenScreenshot(step.screenshot_url as string)
                  }
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent-text transition-opacity hover:opacity-80"
                >
                  <ImageIcon size={12} />
                  Ver captura
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
