import { cn } from "@/lib/cn";
import { Sparkline } from "./sparkline";

export type StatTone = "accent" | "success" | "danger" | "running";

const DOT: Record<StatTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  running: "bg-running",
};

export function StatTile({
  label,
  value,
  unit,
  tone,
  trend,
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone: StatTone;
  trend?: number[];
}): React.JSX.Element {
  return (
    <div className="relative flex flex-col gap-2 overflow-hidden bg-surface px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", DOT[tone])} />
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
          {label}
        </span>
      </div>
      <p className="tabular text-[1.75rem] font-semibold leading-none tracking-tight text-text">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-medium text-faint">{unit}</span>
        ) : null}
      </p>
      {trend && trend.length >= 2 ? (
        <Sparkline
          data={trend}
          className="pointer-events-none absolute bottom-0 right-0 h-2/3 w-1/2 opacity-60"
        />
      ) : null}
    </div>
  );
}
