"use client";

import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: string; count?: number };

export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              active
                ? "bg-elevated text-text shadow-e1"
                : "text-muted hover:text-text",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="tabular font-mono text-[0.6875rem] text-faint">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
