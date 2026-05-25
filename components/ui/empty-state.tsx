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
      <div className="border-border bg-surface-2 text-faint grid size-12 place-items-center rounded-xl border">
        <Icon size={22} />
      </div>
      <h3 className="text-text mt-4 text-sm font-semibold">{title}</h3>
      <p className="text-muted mt-1.5 max-w-xs text-sm text-pretty">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
