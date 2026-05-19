import Link from "next/link";
import { cn } from "@/lib/cn";

/** Viewfinder mark: corner brackets locking onto a target point. */
function Mark({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md bg-accent text-accent-fg shadow-e1"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.58}
        height={size * 0.58}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 4H5.2A1.2 1.2 0 0 0 4 5.2V8" />
        <path d="M16 4h2.8A1.2 1.2 0 0 1 20 5.2V8" />
        <path d="M8 20H5.2A1.2 1.2 0 0 1 4 18.8V16" />
        <path d="M16 20h2.8a1.2 1.2 0 0 0 1.2-1.2V16" />
        <circle cx="12" cy="12" r="2.7" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Logo({
  href = "/",
  showWord = true,
  size = 28,
  className,
}: {
  href?: string | null;
  showWord?: boolean;
  size?: number;
  className?: string;
}): React.JSX.Element {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark size={size} />
      {showWord ? (
        <span className="text-[0.975rem] font-semibold tracking-[-0.01em] text-text">
          FlowCheck
        </span>
      ) : null}
    </span>
  );

  if (href === null) return content;

  return (
    <Link
      href={href}
      aria-label="FlowCheck — inicio"
      className="inline-flex rounded-md"
    >
      {content}
    </Link>
  );
}
