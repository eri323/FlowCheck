import { cn } from "@/lib/cn";

/** Pista visual de atajo de teclado. Decorativa: no captura eventos. */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <kbd
      className={cn(
        "border-border bg-surface-2 inline-flex items-center gap-1 rounded border border-b-2 px-1.5 py-0.5",
        "text-faint font-mono text-[0.6875rem]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
