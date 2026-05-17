import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * A single surface container. Used sparingly: spacing and dividers handle most
 * grouping. Never nested inside another Card.
 */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface", className)}
      {...props}
    />
  );
}
