import Link from "next/link";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight } from "@/components/ui/icons";
import { ReportMock } from "./report-mock";

export function Hero({ authed }: { authed: boolean }): React.JSX.Element {
  return (
    <section className="relative overflow-hidden">
      {/* Faint grid, faded out toward the edges. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 75% 55% at 50% 0%, black, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 55% at 50% 0%, black, transparent 78%)",
        }}
      />
      {/* Soft clay glow behind the product visual. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-24 size-[34rem] rounded-full opacity-[0.14] blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--accent) 0%, transparent 68%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-10 lg:pb-28 lg:pt-24">
        <div>
          <span
            className="inline-flex animate-rise items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
            style={{ animationDelay: "0ms" }}
          >
            <span className="size-1.5 rounded-full bg-accent" />
            Construido sobre Playwright y Gemini
          </span>

          <h1
            className="mt-5 animate-rise text-balance text-[2.5rem] font-semibold leading-[1.07] tracking-[-0.03em] text-text sm:text-5xl lg:text-[3.25rem]"
            style={{ animationDelay: "60ms" }}
          >
            Describe qué probar. Lo demás lo hace la IA.
          </h1>

          <p
            className="mt-5 max-w-xl animate-rise text-pretty text-base leading-relaxed text-muted sm:text-[1.0625rem]"
            style={{ animationDelay: "120ms" }}
          >
            Pega la URL de tu aplicación y explica el flujo en una frase. FlowCheck
            genera los casos en Playwright, los ejecuta en un navegador real y
            te devuelve un reporte en vivo con una captura por cada paso.
          </p>

          <div
            className="mt-7 flex animate-rise flex-wrap items-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href={authed ? "/dashboard" : "/signup"}
              className={cn(buttonVariants({ size: "lg" }), "group")}
            >
              {authed ? "Ir al panel" : "Empezar gratis"}
              <ArrowRight
                size={16}
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href="#como-funciona"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Ver cómo funciona
            </a>
          </div>

          <p
            className="mt-6 animate-rise font-mono text-xs text-faint"
            style={{ animationDelay: "240ms" }}
          >
            sin tarjeta · reporte en tiempo real · detección adaptativa de login
          </p>
        </div>

        <div
          className="animate-rise lg:pl-4"
          style={{ animationDelay: "200ms" }}
        >
          <ReportMock />
        </div>
      </div>
    </section>
  );
}
