"use client";

import { useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { Topbar } from "./topbar";
import { Credit } from "@/components/ui/credit";

export function DashboardShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="bg-bg flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="border-border bg-surface-2 hidden w-60 shrink-0 border-r lg:block">
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
            className="animate-fade-in bg-bg/70 absolute inset-0 backdrop-blur-sm"
          />
          <div className="animate-fade-in border-border bg-surface-2 absolute top-0 left-0 h-full w-64 border-r">
            <SidebarNav onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={userEmail} onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 px-5 py-7 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <footer className="border-border border-t px-5 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <Credit />
          </div>
        </footer>
      </div>
    </div>
  );
}
