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
              {!last ? <span className="bg-border w-px flex-1" /> : null}
            </div>
            <div className="min-w-0 flex-1 pt-1 pb-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <code className="bg-surface-2 text-accent-text rounded px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium">
                  {step.action}
                </code>
                {adaptive ? <Badge tone="accent">adaptativo</Badge> : null}
                {selectorText ? (
                  <span className="text-muted min-w-0 truncate font-mono text-xs">
                    {selectorText}
                  </span>
                ) : null}
                {step.value ? (
                  <span className="text-faint min-w-0 truncate font-mono text-xs">
                    → {step.value}
                  </span>
                ) : null}
                {step.duration_ms !== null ? (
                  <span className="tabular text-faint ml-auto shrink-0 font-mono text-[0.6875rem]">
                    {step.duration_ms} ms
                  </span>
                ) : null}
              </div>
              {step.error_message ? (
                <p className="bg-danger-bg text-danger-text mt-1.5 rounded-md px-2.5 py-1.5 text-xs">
                  {step.error_message}
                </p>
              ) : null}
              {step.screenshot_url ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenScreenshot(step.screenshot_url as string)
                  }
                  className="text-accent-text mt-1.5 inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
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
