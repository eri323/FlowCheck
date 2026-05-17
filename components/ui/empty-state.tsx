import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type IconComponent = (props: { size?: number }) => React.JSX.Element;

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-xl border border-border bg-surface-2 text-faint">
        <Icon size={22} />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-text">{title}</h3>
      <p className="mt-1.5 max-w-xs text-pretty text-sm text-muted">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
