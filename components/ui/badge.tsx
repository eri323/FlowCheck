import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone =
  | "accent"
  | "success"
  | "danger"
  | "running"
  | "warning"
  | "neutral";

const tones: Record<Tone, string> = {
  accent: "bg-accent-subtle text-accent-text",
  success: "bg-success-bg text-success-text",
  danger: "bg-danger-bg text-danger-text",
  running: "bg-running-bg text-running-text",
  warning: "bg-warning-bg text-warning-text",
  neutral: "bg-neutral-bg text-neutral-text",
};

const dots: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  running: "bg-running",
  warning: "bg-warning",
  neutral: "bg-faint",
};

export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            dots[tone],
            pulse && "animate-pulse-dot",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
