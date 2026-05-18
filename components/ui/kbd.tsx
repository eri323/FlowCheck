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
        "inline-flex items-center gap-1 rounded border border-border border-b-2 bg-surface-2 px-1.5 py-0.5",
        "font-mono text-[0.6875rem] text-faint",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
