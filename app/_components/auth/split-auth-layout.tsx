import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Credit } from "@/components/ui/credit";
import { Check, ArrowRight } from "@/components/ui/icons";

const KEY_POINTS = [
  "Pegas la URL y describes el flujo en una frase.",
  "La IA genera y ejecuta los casos en un navegador real.",
  "Recibes un reporte en vivo con captura por cada paso.",
];

export function SplitAuthLayout({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      {/* Panel de pitch */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border px-10 py-10 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-35"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 40% 35%, black, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 40% 35%, black, transparent 80%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 size-[28rem] rounded-full opacity-[0.12] blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--accent) 0%, transparent 68%)",
          }}
        />

        <div className="relative">
          <Logo href="/tour" />
        </div>

        <div className="relative max-w-md">
          <span className="border-border bg-surface text-muted inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className="bg-accent size-1.5 rounded-full" />
            Construido sobre Playwright y Gemini
          </span>
          <h2 className="text-text mt-5 text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
            Describe qué probar. Lo demás lo hace la IA.
          </h2>
          <p className="text-muted mt-4 text-pretty">
            Pruebas end-to-end generadas por IA y ejecutadas en un navegador
            real, con reporte en vivo.
          </p>
          <ul className="mt-7 flex flex-col gap-3">
            {KEY_POINTS.map((point) => (
              <li key={point} className="text-muted flex items-start gap-3 text-sm">
                <span className="bg-accent-subtle text-accent-text mt-px grid size-5 shrink-0 place-items-center rounded-full">
                  <Check size={12} />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <Link
            href="/tour"
            className="text-muted hover:text-text group inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            Ver presentación completa
            <ArrowRight
              size={14}
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </section>

      {/* Panel del formulario */}
      <section className="relative flex flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          {/* Logo compacto solo en móvil; en desktop el logo vive en el panel izquierdo */}
          <span className="lg:invisible">
            <Logo href="/tour" />
          </span>
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center justify-center px-5 pb-10">
          <div className="animate-rise w-full max-w-sm">
            {/* Encabezado de pitch compacto solo en móvil */}
            <div className="mb-6 lg:hidden">
              <h2 className="text-text text-xl font-semibold tracking-[-0.01em]">
                Describe qué probar. Lo demás lo hace la IA.
              </h2>
              <p className="text-muted mt-1 text-sm">
                Pruebas end-to-end generadas por IA, con reporte en vivo.
              </p>
            </div>
            {children}
            {footer ? (
              <p className="text-faint mt-6 text-center text-xs">{footer}</p>
            ) : null}
          </div>
        </div>

        <footer className="px-5 pb-6 sm:px-8">
          <Credit className="text-center" />
        </footer>
      </section>
    </div>
  );
}
