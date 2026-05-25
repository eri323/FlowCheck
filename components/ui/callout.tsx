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
        "border-border bg-accent-subtle rounded-lg border px-3.5 py-3",
        className,
      )}
    >
      <span className="text-accent-text text-[0.625rem] font-semibold tracking-[0.09em] uppercase">
        {label}
      </span>
      <p className="text-muted mt-1 text-sm leading-relaxed text-pretty">
        {children}
      </p>
    </aside>
  );
}
