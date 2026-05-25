"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Close, Menu } from "@/components/ui/icons";

const LINKS = [
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Tipos de prueba", href: "#tipos" },
  { label: "Reporte en vivo", href: "#reporte" },
];

export function MarketingNav({
  authed,
}: {
  authed: boolean;
}): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-200",
        scrolled || open
          ? "border-border bg-bg/85 border-b backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-muted hover:text-text rounded-md px-3 py-2 text-sm transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {authed ? (
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              Ir al panel
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden sm:inline-flex",
                )}
              >
                Iniciar sesión
              </Link>
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "hidden sm:inline-flex",
                )}
              >
                Empezar
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            className="text-muted hover:bg-surface-2 hover:text-text inline-flex size-9 items-center justify-center rounded-md transition-colors md:hidden"
          >
            {open ? <Close size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="border-border bg-bg border-t px-5 py-4 md:hidden">
          <div className="flex flex-col">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-muted hover:text-text rounded-md px-2 py-2.5 text-sm transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="border-border mt-3 flex flex-col gap-2 border-t pt-3">
            {authed ? (
              <Link href="/dashboard" className={buttonVariants()}>
                Ir al panel
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Iniciar sesión
                </Link>
                <Link href="/signup" className={buttonVariants()}>
                  Empezar
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
