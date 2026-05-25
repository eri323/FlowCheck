"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { buttonVariants } from "@/components/ui/button";
import { Grid, Plus, Runs, Bolt, Settings, Api } from "@/components/ui/icons";

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

type NavItem = {
  label: string;
  href: string;
  icon: IconComponent;
  live?: boolean;
};

const PANEL: NavItem[] = [
  { label: "Resumen", href: "/dashboard", icon: Grid },
  { label: "Test runs", href: "/dashboard/runs", icon: Runs },
  { label: "En vivo", href: "/dashboard/runs", icon: Bolt, live: true },
];

const CUENTA: { label: string; icon: IconComponent }[] = [
  { label: "API & webhooks", icon: Api },
  { label: "Configuración", icon: Settings },
];

export function SidebarNav({
  onNavigate,
  runsCount = 0,
  activeCount = 0,
}: {
  onNavigate?: () => void;
  runsCount?: number;
  activeCount?: number;
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
          const active = !item.live && isActive(item.href);
          const count = item.live ? activeCount : runsCount;
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
              {item.label !== "Resumen" && count > 0 ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 font-mono text-[0.625rem]",
                    item.live
                      ? "border-accent-subtle bg-accent-subtle text-accent-text"
                      : "border-border bg-surface-2 text-faint",
                  )}
                >
                  {item.live ? (
                    <span className="animate-pulse-dot bg-accent size-1.5 rounded-full" />
                  ) : null}
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}

        <p className="text-muted px-2 pt-4 pb-1.5 font-mono text-[0.625rem] tracking-[0.14em] uppercase">
          Cuenta
        </p>
        {CUENTA.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              aria-disabled="true"
              title="Próximamente"
              className="text-faint flex cursor-not-allowed items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-sm opacity-60"
            >
              <Icon size={16} className="text-faint" />
              <span className="flex-1">{item.label}</span>
              <span className="border-border bg-surface-2 text-faint rounded-full border px-1.5 font-mono text-[0.5625rem] tracking-wide uppercase">
                pronto
              </span>
            </span>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 px-2.5 pt-4">
        <div className="text-faint flex items-center justify-between font-mono text-[0.625rem]">
          <span>Uso del mes</span>
          <span className="text-muted">— / —</span>
        </div>
        <div className="bg-surface-2 h-1 overflow-hidden rounded-full">
          <div className="bg-accent h-full w-0 rounded-full" />
        </div>
        <p className="text-faint font-mono text-[0.625rem]">
          FlowCheck · entorno de demostración
        </p>
      </div>
    </div>
  );
}
