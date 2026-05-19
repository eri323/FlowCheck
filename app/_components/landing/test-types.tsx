import { Reveal } from "@/components/ui/reveal";
import { Callout } from "@/components/ui/callout";
import {
  Bolt,
  Cursor,
  Pencil,
  Search,
  Shield,
  Terminal,
} from "@/components/ui/icons";

type IconComponent = (props: { size?: number }) => React.JSX.Element;

const TYPES: { name: string; icon: IconComponent; body: string }[] = [
  {
    name: "Login",
    icon: Shield,
    body: "Verifica que las credenciales dan acceso y que la app redirige a la zona privada.",
  },
  {
    name: "Registro",
    icon: Pencil,
    body: "Crea una cuenta nueva y comprueba que el alta se completa sin errores.",
  },
  {
    name: "Búsqueda",
    icon: Search,
    body: "Usa el buscador del sitio y valida que aparecen resultados relevantes.",
  },
  {
    name: "Navegación",
    icon: Cursor,
    body: "Recorre la app desde tu instrucción libre, o corre un smoke test del inicio.",
  },
  {
    name: "Formulario",
    icon: Terminal,
    body: "Rellena un formulario campo por campo y confirma que el envío funciona.",
  },
  {
    name: "E-commerce",
    icon: Bolt,
    body: "Simula una compra completa con tarjeta de prueba, del carrito al pago.",
  },
];

export function TestTypes(): React.JSX.Element {
  return (
    <section id="tipos" className="border-t border-border bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text sm:text-3xl">
              Seis tipos de prueba, sin configuración
            </h2>
            <p className="mt-3 text-pretty text-muted">
              Cada tipo guía a la IA con la estructura correcta y mantiene los
              datos sensibles separados de tu instrucción libre.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-10 overflow-hidden rounded-xl border border-border">
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
              {TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <div key={type.name} className="bg-surface p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 place-items-center rounded-md bg-surface-2 text-accent-text">
                        <Icon size={16} />
                      </span>
                      <h3 className="text-sm font-semibold text-text">
                        {type.name}
                      </h3>
                    </div>
                    <p className="mt-2.5 text-pretty text-sm leading-relaxed text-muted">
                      {type.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <Reveal delay={160}>
          <Callout className="mt-6">
            El tipo{" "}
            <strong className="font-medium text-text">Login</strong> no ejecuta
            los selectores al pie de la letra: una heurística localiza el campo
            de identificador, la contraseña y el botón, y verifica el resultado
            por comportamiento. Tolera cualquier idioma y maquetado — un
            selector exótico no rompe la prueba.
          </Callout>
        </Reveal>
      </div>
    </section>
  );
}
