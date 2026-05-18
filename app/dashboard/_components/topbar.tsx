"use client";

import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Menu, Bell } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { UserMenu } from "./user-menu";

const CRUMBS: { match: (p: string) => boolean; trail: string[] }[] = [
  { match: (p) => p === "/dashboard", trail: ["Panel", "Resumen"] },
  {
    match: (p) => p === "/dashboard/runs/new",
    trail: ["Panel", "Test runs", "Nuevo"],
  },
  {
    match: (p) =>
      /^\/dashboard\/runs\/[^/]+$/.test(p) && p !== "/dashboard/runs/new",
    trail: ["Panel", "Test runs", "Detalle"],
  },
  { match: (p) => p === "/dashboard/runs", trail: ["Panel", "Test runs"] },
];

function crumbsFor(pathname: string): string[] {
  return CRUMBS.find((c) => c.match(pathname))?.trail ?? ["Panel"];
}

export function Topbar({
  userEmail,
  onMenuClick,
}: {
  userEmail: string;
  onMenuClick: () => void;
}): React.JSX.Element {
  const crumbs = crumbsFor(usePathname());

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir navegación"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
        >
          <Menu size={18} />
        </button>
        <Logo />
      </div>

      <nav aria-label="Ruta" className="hidden items-center gap-2 text-sm lg:flex">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 ? <span className="text-faint">/</span> : null}
            <span className={i === crumbs.length - 1 ? "text-text" : "text-muted"}>
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-1.5">
        <Kbd className="hidden sm:inline-flex">⌘ K</Kbd>
        <button
          type="button"
          aria-disabled="true"
          aria-label="Notificaciones (próximamente)"
          tabIndex={-1}
          title="Próximamente"
          className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-md text-faint opacity-60"
        >
          <Bell size={16} />
        </button>
        <ThemeToggle />
        <UserMenu email={userEmail} />
      </div>
    </header>
  );
}
