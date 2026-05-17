import { cn } from "@/lib/cn";

export function Spinner({
  size = 15,
  className,
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em]",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
