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
        className="hover:bg-surface-2 flex items-center gap-1 rounded-md p-1 pr-1.5 transition-colors duration-150"
      >
        <span className="bg-accent-subtle text-accent-text grid size-7 place-items-center rounded-full text-xs font-semibold">
          {initial}
        </span>
        <ChevronDown size={14} className="text-faint" />
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-in border-border bg-elevated shadow-e3 absolute top-[calc(100%+6px)] right-0 w-60 rounded-lg border p-1.5"
        >
          <div className="px-2.5 py-2">
            <p className="text-faint text-xs">Conectado como</p>
            <p className="text-text truncate text-sm font-medium">{email}</p>
          </div>
          <div className="bg-border my-1 h-px" />
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="text-muted hover:bg-surface-2 hover:text-text flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors duration-150"
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
