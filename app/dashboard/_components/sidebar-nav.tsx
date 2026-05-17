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

const NAV: { label: string; href: string; icon: IconComponent }[] = [
  { label: "Resumen", href: "/dashboard", icon: Grid },
  { label: "Test runs", href: "/dashboard/runs", icon: Runs },
];

export function SidebarNav({
  onNavigate,
}: {
  onNavigate?: () => void;
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
        <p className="px-2.5 pb-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.07em] text-faint">
          Panel
        </p>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150",
                active
                  ? "bg-surface font-medium text-text shadow-e1"
                  : "text-muted hover:bg-surface hover:text-text",
              )}
            >
              <Icon
                size={16}
                className={active ? "text-accent-text" : "text-faint"}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2.5 pt-4">
        <p className="font-mono text-[0.625rem] text-faint">
          Probe · entorno de demostración
        </p>
      </div>
    </div>
  );
}
