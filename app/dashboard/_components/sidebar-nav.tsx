"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { buttonVariants } from "@/components/ui/button";
import { Grid, Plus, Runs } from "@/components/ui/icons";

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

type NavItem = {
  label: string;
  href: string;
  icon: IconComponent;
};

const PANEL: NavItem[] = [
  { label: "Resumen", href: "/dashboard", icon: Grid },
  { label: "Test runs", href: "/dashboard/runs", icon: Runs },
];

export function SidebarNav({
  onNavigate,
  runsCount = 0,
}: {
  onNavigate?: () => void;
  runsCount?: number;
}): React.JSX.Element {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/runs") {
      return (
        pathname.startsWith("/dashboard/runs") &&
        pathname !== "/dashboard/runs/new"
      );
    }
    return false;
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="px-2 py-3">
        <Logo />
      </div>

      <Link
        href="/dashboard/runs/new"
        onClick={onNavigate}
        className={cn(buttonVariants(), "mt-2 w-full")}
      >
        <Plus size={16} />
        Nuevo test run
      </Link>

      <nav className="mt-5 flex flex-col gap-0.5">
        <p className="text-muted px-2 pt-3.5 pb-1.5 font-mono text-[0.625rem] tracking-[0.14em] uppercase">
          Panel
        </p>
        {PANEL.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150",
                active
                  ? "border-border bg-surface-2 text-text border font-medium"
                  : "text-muted hover:bg-surface hover:text-text border border-transparent",
              )}
            >
              <Icon
                size={16}
                className={active ? "text-accent" : "text-faint"}
              />
              <span className="flex-1">{item.label}</span>
              {item.label !== "Resumen" && runsCount > 0 ? (
                <span className="border-border bg-surface-2 text-faint inline-flex items-center gap-1 rounded-full border px-1.5 font-mono text-[0.625rem]">
                  {runsCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 px-2.5 pt-4">
        <p className="text-faint font-mono text-[0.625rem]">
          FlowCheck · entorno de demostración
        </p>
      </div>
    </div>
  );
}
