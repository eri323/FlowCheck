import { Reveal } from "@/components/ui/reveal";

const STEPS = [
  {
    title: "Describe el flujo",
    body: "Elige el tipo de prueba, pega la URL y escribe en lenguaje natural qué debería pasar. Sin selectores, sin código.",
  },
  {
    title: "La IA genera los casos",
    body: "Gemini convierte tu descripción en casos de prueba estructurados y válidos, listos para ejecutarse en Playwright.",
  },
  {
    title: "Observa la ejecución en vivo",
    body: "Un worker corre la prueba en Chromium headless. Ves cada paso completarse en tiempo real, con su captura.",
  },
];

export function HowItWorks(): React.JSX.Element {
  return (
    <section id="como-funciona" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text sm:text-3xl">
              De la idea al reporte en tres pasos
            </h2>
            <p className="mt-3 text-pretty text-muted">
              Sin escribir selectores ni mantener scripts frágiles. Tú
              describes el comportamiento esperado, Probe se encarga del resto.
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
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
