import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-md border bg-surface text-sm text-text placeholder:text-faint outline-none transition-[border-color,box-shadow,background-color] duration-150 focus-visible:outline-none focus:bg-elevated disabled:cursor-not-allowed disabled:opacity-55";

function stateClass(invalid?: boolean): string {
  return invalid
    ? "border-danger focus:border-danger focus:ring-[3px] focus:ring-danger/20"
    : "border-border hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20";
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({
  className,
  invalid,
  ...props
}: InputProps): React.JSX.Element {
  return (
    <input
      className={cn(fieldBase, "h-9 px-3", stateClass(invalid), className)}
      {...props}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaProps): React.JSX.Element {
  return (
    <textarea
      className={cn(
        fieldBase,
        "min-h-[76px] resize-y px-3 py-2 leading-relaxed",
        stateClass(invalid),
        className,
      )}
      {...props}
    />
  );
}
