# Rediseño de landing y rebranding a FlowCheck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renombrar el proyecto de `Probe` a `FlowCheck` y enriquecer la landing pública con una capa de detalle técnico mediante un componente `<Callout>` reutilizable.

**Architecture:** Trabajo puramente presentacional sobre la página `/`. Un componente nuevo (`Callout`) se integra en 3 secciones de landing existentes. El rebranding es un cambio de texto en archivos puntuales; la marca gráfica del logo no cambia.

**Tech Stack:** Next.js 16 (App Router, React Server Components), Tailwind CSS v4, TypeScript strict.

**Nota sobre tests:** este trabajo es presentacional y no introduce endpoints. El stack de tests del proyecto (Vitest) cubre solo rutas de API (`/tests/api/`), y no hay infraestructura de testing de componentes React. Por eso este plan **no** incluye pasos de test unitario — la verificación es `typecheck` + `lint` + `build` + revisión visual, tal como fija el spec. No añadas tests de componentes.

**Spec de referencia:** `docs/superpowers/specs/2026-05-18-landing-flowcheck-design.md`

---

## File Structure

**Crear:**
- `components/ui/callout.tsx` — componente `<Callout>`: aside con etiqueta y cuerpo, para detalles técnicos.

**Modificar (rebranding, Tarea 2):**
- `components/ui/logo.tsx` — wordmark y `aria-label`.
- `app/layout.tsx` — `metadata.title`.
- `app/_components/landing/hero.tsx` — frase del cuerpo.
- `app/_components/landing/marketing-footer.tsx` — copyright.
- `app/dashboard/_components/sidebar-nav.tsx` — pie del sidebar.

**Modificar (callouts + rebranding, Tareas 3-5):**
- `app/_components/landing/how-it-works.tsx` — rename + 3 callouts (reescritura completa, Tarea 3).
- `app/_components/landing/test-types.tsx` — 1 callout de sección (Tarea 4).
- `app/_components/landing/features.tsx` — 1 callout de sección (Tarea 5).

---

## Task 1: Componente `<Callout>`

**Files:**
- Create: `components/ui/callout.tsx`

- [ ] **Step 1: Crear el componente**

Crear `components/ui/callout.tsx` con este contenido exacto:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Callout({
  label = "Bajo el capó",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <aside
      className={cn(
        "rounded-lg border border-border bg-accent-subtle px-3.5 py-3",
        className,
      )}
    >
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.09em] text-accent-text">
        {label}
      </span>
      <p className="mt-1 text-pretty text-sm leading-relaxed text-muted">
        {children}
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS, sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/ui/callout.tsx
git commit -m "feat(ui): componente Callout para detalles tecnicos" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Rebranding Probe → FlowCheck

Renombra 5 archivos. El sexto archivo afectado (`how-it-works.tsx`) se renombra en la Tarea 3 como parte de su reescritura completa. La marca gráfica del logo (función `Mark` en `logo.tsx`) **no se toca**.

**Files:**
- Modify: `components/ui/logo.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/_components/landing/hero.tsx`
- Modify: `app/_components/landing/marketing-footer.tsx`
- Modify: `app/dashboard/_components/sidebar-nav.tsx`

- [ ] **Step 1: Editar `components/ui/logo.tsx`**

Cambio 1 — el wordmark. Reemplazar:
```tsx
          Probe
```
por:
```tsx
          FlowCheck
```

Cambio 2 — el `aria-label`. Reemplazar:
```tsx
      aria-label="Probe — inicio"
```
por:
```tsx
      aria-label="FlowCheck — inicio"
```

- [ ] **Step 2: Editar `app/layout.tsx`**

Reemplazar el bloque `title`:
```tsx
    default: "Probe — Testing automatizado con IA",
    template: "%s · Probe",
```
por:
```tsx
    default: "FlowCheck — Testing automatizado con IA",
    template: "%s · FlowCheck",
```

- [ ] **Step 3: Editar `app/_components/landing/hero.tsx`**

Reemplazar:
```tsx
en una frase. Probe
```
por:
```tsx
en una frase. FlowCheck
```

- [ ] **Step 4: Editar `app/_components/landing/marketing-footer.tsx`**

Reemplazar:
```tsx
            © 2026 Probe. Proyecto de demostración técnica.
```
por:
```tsx
            © 2026 FlowCheck. Proyecto de demostración técnica.
```

- [ ] **Step 5: Editar `app/dashboard/_components/sidebar-nav.tsx`**

Reemplazar:
```tsx
          Probe · entorno de demostración
```
por:
```tsx
          FlowCheck · entorno de demostración
```

- [ ] **Step 6: Verificar que no quedan ocurrencias en estos 5 archivos**

Buscar `Probe` (con P mayúscula) en `components/ui/logo.tsx`, `app/layout.tsx`, `app/_components/landing/hero.tsx`, `app/_components/landing/marketing-footer.tsx` y `app/dashboard/_components/sidebar-nav.tsx`.
Expected: 0 ocurrencias. (`how-it-works.tsx` aún tendrá una ocurrencia — se resuelve en la Tarea 3.)

Luego: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/ui/logo.tsx app/layout.tsx app/_components/landing/hero.tsx app/_components/landing/marketing-footer.tsx app/dashboard/_components/sidebar-nav.tsx
git commit -m "refactor: renombra el proyecto de Probe a FlowCheck" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Callouts en "Cómo funciona"

Reescritura completa de `how-it-works.tsx`: incluye el rename `Probe → FlowCheck` (línea del párrafo introductorio) y añade un `<Callout>` debajo de cada uno de los 3 pasos.

**Files:**
- Modify: `app/_components/landing/how-it-works.tsx`

- [ ] **Step 1: Reemplazar el contenido completo de `app/_components/landing/how-it-works.tsx`**

```tsx
import { Reveal } from "@/components/ui/reveal";
import { Callout } from "@/components/ui/callout";

type Step = { title: string; body: string; callout: React.ReactNode };

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
    <section id="como-funciona" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
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
```

- [ ] **Step 2: Verificar typecheck y build**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/_components/landing/how-it-works.tsx
git commit -m "feat(landing): callouts tecnicos en la seccion Como funciona" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Callout en "Tipos de prueba"

Añade un `<Callout>` de sección bajo la grilla de 6 tipos en `test-types.tsx`.

**Files:**
- Modify: `app/_components/landing/test-types.tsx`

- [ ] **Step 1: Añadir el import**

En `app/_components/landing/test-types.tsx`, reemplazar:
```tsx
import { Reveal } from "@/components/ui/reveal";
```
por:
```tsx
import { Reveal } from "@/components/ui/reveal";
import { Callout } from "@/components/ui/callout";
```

- [ ] **Step 2: Insertar el callout tras la grilla**

Reemplazar el final del componente:
```tsx
        </Reveal>
      </div>
    </section>
  );
}
```
por:
```tsx
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
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/landing/test-types.tsx
git commit -m "feat(landing): callout de login adaptativo en Tipos de prueba" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Callout en "Reporte en vivo"

Añade un `<Callout>` de sección al final de la columna de features en `features.tsx`.

**Files:**
- Modify: `app/_components/landing/features.tsx`

- [ ] **Step 1: Añadir el import**

En `app/_components/landing/features.tsx`, reemplazar:
```tsx
import { Reveal } from "@/components/ui/reveal";
```
por:
```tsx
import { Reveal } from "@/components/ui/reveal";
import { Callout } from "@/components/ui/callout";
```

- [ ] **Step 2: Insertar el callout tras la lista de features**

Reemplazar:
```tsx
          })}
        </div>
      </div>
    </section>
```
por:
```tsx
          })}

          <Reveal delay={FEATURES.length * 90}>
            <Callout className="mt-6">
              Supabase Realtime solo entrega eventos desde que el canal se
              suscribe, dejando un hueco de 1–3 s. FlowCheck lo cierra
              reconciliando contra la base de datos: Realtime es la vía rápida,
              el refetch es la garantía de correctitud.
            </Callout>
          </Reveal>
        </div>
      </div>
    </section>
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/landing/features.tsx
git commit -m "feat(landing): callout de reconciliacion en Reporte en vivo" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Verificación final

Sin cambios de código. Confirma que todo el trabajo es correcto.

**Files:** ninguno.

- [ ] **Step 1: Confirmar que no queda ninguna ocurrencia de `Probe`**

Buscar `Probe` (con P mayúscula) en los directorios `app/` y `components/`.
Expected: 0 ocurrencias. (El identificador `probeLimit` en `lib/playwright/adaptive-login.ts` va en minúscula y queda fuera de esta búsqueda — no se toca.)

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS, sin errores y sin `any`.

- [ ] **Step 3: lint**

Run: `npm run lint`
Expected: limpio, sin warnings ni errores.

- [ ] **Step 4: build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Revisión visual**

Run: `npm run dev` y abrir `http://localhost:3000`.
Verificar:
- El logo y los textos muestran "FlowCheck" en la landing, el footer y el sidebar del dashboard.
- Los 5 callouts ("Bajo el capó") aparecen: 3 en Cómo funciona, 1 en Tipos de prueba, 1 en Reporte en vivo.
- Los callouts son legibles en tema claro y oscuro (toggle del nav).
- El layout es correcto en móvil y escritorio (los callouts se ajustan sin desbordar).
- La pestaña del navegador muestra el título con "FlowCheck".

---

## Self-Review

- **Cobertura del spec:** Parte 1 (rebranding) → Tareas 2 y 3. Parte 2 (componente `Callout`) → Tarea 1. Parte 3 (capa técnica por sección): Hero sin callout (solo rename, Tarea 2); Cómo funciona ×3 → Tarea 3; Tipos de prueba ×1 → Tarea 4; Reporte en vivo ×1 → Tarea 5; CTA/Footer sin callout (Footer renombrado en Tarea 2). Verificación → Tarea 6. Sin huecos.
- **Sin placeholders:** todos los pasos muestran código o comandos concretos.
- **Consistencia de tipos:** `Callout` se define con props `label?`, `children`, `className?` en la Tarea 1 y se usa con `className` y children en las Tareas 3-5. La Tarea 3 pasa `React.ReactNode` como `callout` (string o fragmento con `<code>`), compatible con `children: ReactNode` de `Callout`.
