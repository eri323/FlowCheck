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
          "border-border bg-surface text-text h-9 w-full cursor-pointer appearance-none rounded-md border pr-8 pl-3 text-sm transition-[border-color,box-shadow] duration-150 outline-none",
          "hover:border-border-strong focus-visible:border-accent focus-visible:ring-accent/20 focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-55",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
      />
    </div>
  );
}
