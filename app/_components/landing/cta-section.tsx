import Link from "next/link";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/ui/reveal";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight } from "@/components/ui/icons";

export function CtaSection({
  authed,
}: {
  authed: boolean;
}): React.JSX.Element {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-accent-subtle px-6 py-14 text-center sm:px-12 sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 left-1/2 size-[26rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
              }}
            />
            <div className="relative">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text sm:text-[2rem]">
                Lanza tu primer test run hoy
              </h2>
              <p className="mx-auto mt-3 max-w-md text-pretty text-muted">
                Crea una cuenta y deja que la IA escriba la prueba. El primer
                reporte tarda menos de un minuto.
              </p>
              <div className="mt-7 flex justify-center">
                <Link
                  href={authed ? "/dashboard" : "/signup"}
                  className={cn(buttonVariants({ size: "lg" }), "group")}
                >
                  {authed ? "Ir al panel" : "Crear cuenta gratis"}
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
