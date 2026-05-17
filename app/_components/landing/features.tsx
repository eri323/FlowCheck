import { Reveal } from "@/components/ui/reveal";
import { Bolt, ImageIcon, Sparkles } from "@/components/ui/icons";

type IconComponent = (props: { size?: number }) => React.JSX.Element;

const FEATURES: { icon: IconComponent; title: string; body: string }[] = [
  {
    icon: Bolt,
    title: "Reporte en tiempo real",
    body: "El panel se actualiza solo vía Supabase Realtime y reconcilia contra la base de datos. Ves cada paso pasar a verde sin recargar nada.",
  },
  {
    icon: ImageIcon,
    title: "Una captura por cada paso",
    body: "Cada acción guarda un screenshot. Cuando una prueba falla, ves exactamente en qué punto y con qué estado quedó la pantalla.",
  },
  {
    icon: Sparkles,
    title: "Se adapta a tu aplicación",
    body: "La detección de login entiende formularios en cualquier idioma y maquetado, así que un selector exótico no rompe la prueba.",
  },
];

export function Features(): React.JSX.Element {
  return (
    <section id="reporte" className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:py-24">
        <Reveal>
          <div className="lg:sticky lg:top-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text sm:text-3xl">
              El reporte se construye mientras la prueba corre
            </h2>
            <p className="mt-3 text-pretty text-muted">
              No esperas a que termine para saber qué pasó. La ejecución es
              observable de principio a fin.
            </p>
          </div>
        </Reveal>

        <div>
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} delay={i * 90}>
                <div
                  className={cnRow(i)}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface text-accent-text">
                    <Icon size={18} />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-text">
                      {feature.title}
                    </h3>
                    <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted">
                      {feature.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function cnRow(i: number): string {
  return [
    "flex gap-4 py-6 sm:gap-5",
    i > 0 ? "border-t border-border" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
