"use client";

import { useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { Topbar } from "./topbar";

export function DashboardShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface-2 lg:block">
        <div className="sticky top-0 h-dvh">
          <SidebarNav />
        </div>
      </aside>

      {/* Mobile drawer */}
      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar navegación"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 animate-fade-in bg-bg/70 backdrop-blur-sm"
          />
          <div className="absolute left-0 top-0 h-full w-64 animate-fade-in border-r border-border bg-surface-2">
            <SidebarNav onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={userEmail} onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 px-5 py-7 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
