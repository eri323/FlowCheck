"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Logout } from "@/components/ui/icons";

export function UserMenu({ email }: { email: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = email.trim().charAt(0).toUpperCase() || "U";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de cuenta"
        className="flex items-center gap-1 rounded-md p-1 pr-1.5 transition-colors duration-150 hover:bg-surface-2"
      >
        <span className="grid size-7 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-accent-text">
          {initial}
        </span>
        <ChevronDown size={14} className="text-faint" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] w-60 animate-fade-in rounded-lg border border-border bg-elevated p-1.5 shadow-e3"
        >
          <div className="px-2.5 py-2">
            <p className="text-xs text-faint">Conectado como</p>
            <p className="truncate text-sm font-medium text-text">{email}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
            >
              <Logout size={15} />
              Cerrar sesión
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
