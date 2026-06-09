import { cn } from "@/lib/cn";

const PORTFOLIO_URL = "https://portfolio-phi-self-50.vercel.app/";

export function Credit({ className }: { className?: string }): React.JSX.Element {
  return (
    <p className={cn("text-faint text-xs", className)}>
      Desarrollado por{" "}
      <a
        href={PORTFOLIO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted hover:text-accent-text font-medium underline-offset-2 transition-colors hover:underline"
      >
        Erick Gutiérrez
      </a>
    </p>
  );
}
