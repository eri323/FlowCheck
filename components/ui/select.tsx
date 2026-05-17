import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { ChevronDown } from "./icons";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-sm text-text outline-none transition-[border-color,box-shadow] duration-150",
          "hover:border-border-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/20",
          "disabled:cursor-not-allowed disabled:opacity-55",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
      />
    </div>
  );
}
