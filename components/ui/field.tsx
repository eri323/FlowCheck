import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Shield } from "./icons";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  secure,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  secure?: boolean;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-text text-[0.8125rem] font-medium"
        >
          {label}
          {required ? (
            <span className="text-danger-text ml-0.5" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {secure ? (
          <span className="text-faint inline-flex items-center gap-1 text-[0.6875rem] font-medium">
            <Shield size={11} />
            cifrado
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-danger-text text-xs">{error}</p>
      ) : hint ? (
        <p className="text-faint text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
