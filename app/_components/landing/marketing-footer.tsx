import Link from "next/link";
import { Logo } from "@/components/ui/logo";

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-faint text-xs font-semibold tracking-[0.08em] uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

const linkClass =
  "text-sm text-muted transition-colors duration-150 hover:text-text";

export function MarketingFooter(): React.JSX.Element {
  return (
    <footer className="border-border bg-surface-2/40 border-t">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="text-muted mt-3 text-sm leading-relaxed">
              Pruebas end-to-end generadas por IA y ejecutadas en un navegador
              real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <FooterCol title="Producto">
              <a href="#como-funciona" className={linkClass}>
                Cómo funciona
              </a>
              <a href="#tipos" className={linkClass}>
                Tipos de prueba
              </a>
              <a href="#reporte" className={linkClass}>
                Reporte en vivo
              </a>
            </FooterCol>
            <FooterCol title="Cuenta">
              <Link href="/login" className={linkClass}>
                Iniciar sesión
              </Link>
              <Link href="/signup" className={linkClass}>
                Crear cuenta
              </Link>
            </FooterCol>
          </div>
        </div>

        <div className="border-border mt-10 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-faint text-xs">
            © 2026 FlowCheck. Proyecto de demostración técnica.
          </p>
          <p className="text-faint font-mono text-xs">
            Next.js · Playwright · Gemini · Supabase
          </p>
        </div>
      </div>
    </footer>
  );
}
