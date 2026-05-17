"use client";

import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Menu } from "@/components/ui/icons";
import { UserMenu } from "./user-menu";

export function Topbar({
  userEmail,
  onMenuClick,
}: {
  userEmail: string;
  onMenuClick: () => void;
}): React.JSX.Element {
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

      <div aria-hidden="true" className="hidden lg:block" />

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu email={userEmail} />
      </div>
    </header>
  );
}
