import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/reveal";
import { Callout } from "@/components/ui/callout";

type Step = { title: string; body: string; callout: ReactNode };

const STEPS: Step[] = [
  {
    title: "Describe el flujo",
    body: "Elige el tipo de prueba, pega la URL y escribe en lenguaje natural qué debería pasar. Sin selectores, sin código.",
    callout:
      "Cada tipo de prueba mantiene las credenciales separadas de tu instrucción libre; todo el input se valida con Zod antes de tocar nada.",
  },
  {
    title: "La IA genera los casos",
    body: "Gemini convierte tu descripción en casos de prueba estructurados y válidos, listos para ejecutarse en Playwright.",
    callout: (
      <>
        Gemini responde con{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.8em] text-accent-text">
          responseMimeType: application/json
        </code>
        ; el JSON se valida contra un contrato de tipos estricto antes de
        ejecutar un solo paso.
      </>
    ),
  },
  {
    title: "Observa la ejecución en vivo",
    body: "Un worker corre la prueba en Chromium headless. Ves cada paso completarse en tiempo real, con su captura.",
    callout:
      "Un proceso worker independiente consume una cola BullMQ sobre Redis — los jobs de 30–60 s no bloquean las requests HTTP. 3 jobs concurrentes, 2 reintentos.",
  },
];

export function HowItWorks(): React.JSX.Element {
  return (
    <section
      id="como-funciona"
      className="flex min-h-[calc(100svh-4rem)] flex-col justify-center border-t border-border"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text sm:text-3xl">
              De la idea al reporte en tres pasos
            </h2>
            <p className="mt-3 text-pretty text-muted">
              Sin escribir selectores ni mantener scripts frágiles. Tú
              describes el comportamiento esperado, FlowCheck se encarga del
              resto.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-3 lg:gap-10">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 90}>
              <div className="border-t-2 border-border pt-5">
                <span className="font-mono text-sm font-medium text-accent-text">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-base font-semibold text-text">
                  {step.title}
                </h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
                <Callout className="mt-4">{step.callout}</Callout>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
