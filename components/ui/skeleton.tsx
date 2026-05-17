import { cn } from "@/lib/cn";

export function Skeleton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("skeleton rounded-md", className)} aria-hidden="true" />
  );
}
