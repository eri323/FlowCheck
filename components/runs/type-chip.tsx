import { cn } from "@/lib/cn";

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

export function TypeChip({
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  label: string;
  icon: IconComponent;
  active: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors duration-150",
        active
          ? "border-accent bg-accent-subtle text-text"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
      )}
    >
      <Icon size={16} className={active ? "text-accent-text" : "text-faint"} />
      <span className="font-medium">{label}</span>
    </button>
  );
}
