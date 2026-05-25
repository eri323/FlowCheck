"use client";

import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { Moon, Sun } from "./icons";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** The app is dark-first, so the server always assumes dark. */
function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeToggle({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage unavailable (private mode); the choice simply won't persist.
    }
    listeners.forEach((listener) => listener());
  }, [theme]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"
      }
      className={cn(
        "text-muted hover:bg-surface-2 hover:text-text inline-flex size-9 items-center justify-center rounded-md transition-colors duration-150",
        className,
      )}
    >
      {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
