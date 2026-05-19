import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Callout({
  label = "Bajo el capó",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <aside
      className={cn(
        "rounded-lg border border-border bg-accent-subtle px-3.5 py-3",
        className,
      )}
    >
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.09em] text-accent-text">
        {label}
      </span>
      <p className="mt-1 text-pretty text-sm leading-relaxed text-muted">
        {children}
      </p>
    </aside>
  );
}
