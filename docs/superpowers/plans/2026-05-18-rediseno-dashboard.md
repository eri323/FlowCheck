# Rediseño visual del dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar el lenguaje visual del prototipo (accent esmeralda, componentes ricos) al árbol `/dashboard` real, sin tocar backend, worker ni realtime.

**Architecture:** Token-first e incremental. Primero se reescriben los tokens `--accent*` de `globals.css`; el cambio se propaga solo a todo `bg-accent`/`text-accent`. Luego se crean cinco componentes nuevos y se restiliza pantalla por pantalla, cada una como unidad revisable. La lógica de datos (server components, suscripción Realtime, reconciliación) se preserva intacta — solo cambia el marcado/clases.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4 (`@theme` en `globals.css`), tokens OKLCH, Supabase. Spec: `docs/superpowers/specs/2026-05-18-rediseno-dashboard-design.md`.

---

## Notas para el ejecutor

- **No hay harness de tests de componentes React** (el stack de testing es Vitest solo para `/tests/api`). Este es un refactor visual: la verificación de cada tarea es `npm run typecheck` + `npm run lint`, más una revisión visual con `npm run dev`. La verificación funcional completa (`npm test`) se corre al final (Task 13).
- **Cada commit termina con el trailer** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. Los pasos de commit muestran solo `git commit -m "..."` por brevedad; añade el trailer siempre.
- **Trabajar en `main`** (preferencia del usuario; sin ramas de feature).
- **Estado del repo:** `CLAUDE.md` ya tiene cambios sin commitear de una sesión previa. Revísalos antes de Task 12; el commit de Task 12 los incluirá.
- **Los 5 archivos de prototipo en la raíz** (`app.jsx`, `components.jsx`, `screens.jsx`, `styles.css`, `tweaks-panel.jsx`) son la **referencia visual** de las Tasks 8–11 y se eliminan en Task 13. No los importes ni los ejecutes.
- `npm run lint` (`eslint .`) hoy **falla con 79 errores** producidos por esos `.jsx` de prototipo. Task 1 los excluye de ESLint vía `globalIgnores` para que las verificaciones de lint de las demás tareas pasen; Task 13 revierte la exclusión al borrarlos. `tsc --noEmit` no incluye `.jsx`, así que el typecheck no se ve afectado.
- Convención de nombres: exports nombrados, sin `default`, sin `any`, sin hex hardcodeado, sin estilos inline de color (un `style={{ width }}` dinámico sí es válido).

---

## Task 1: Excluir el prototipo de ESLint y aplicar los tokens esmeralda

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `app/globals.css:10-26` (bloque light `:root`) y `app/globals.css:52-67` (bloque dark `.dark`)

- [ ] **Step 1: Excluir los archivos de prototipo de ESLint**

`npm run lint` falla hoy con 79 errores provenientes de los `.jsx` de prototipo de la raíz. En `eslint.config.mjs`, añadir esos archivos al array de `globalIgnores` para que sigan disponibles como referencia visual sin romper el lint:

```js
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "app.jsx",
    "components.jsx",
    "screens.jsx",
    "tweaks-panel.jsx",
  ]),
```

- [ ] **Step 2: Verificar que el lint queda limpio**

Run: `npm run lint`
Expected: sin errores ni warnings.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: excluir los archivos de prototipo de ESLint"
```

- [ ] **Step 4: Reemplazar los tokens accent del bloque light**

En `app/globals.css`, dentro de `:root`, sustituir las cinco líneas del accent (actualmente hue naranja ~52):

```css
  --accent: oklch(0.6 0.142 163);
  --accent-hover: oklch(0.545 0.145 162);
  --accent-fg: oklch(0.99 0.012 165);
  --accent-subtle: oklch(0.945 0.04 165);
  --accent-text: oklch(0.52 0.13 162);
```

- [ ] **Step 5: Reemplazar los tokens accent del bloque dark**

En `app/globals.css`, dentro de `.dark`, sustituir las cinco líneas del accent:

```css
  --accent: oklch(0.74 0.145 164);
  --accent-hover: oklch(0.8 0.14 166);
  --accent-fg: oklch(0.24 0.05 165);
  --accent-subtle: oklch(0.3 0.05 163);
  --accent-text: oklch(0.82 0.13 165);
```

- [ ] **Step 6: Actualizar el comentario del bloque de tokens**

El comentario sobre la línea `:root` dice "Neutrals are tinted toward the clay accent hue (~67)". Cambiar `clay accent hue` por `accent neutral hue` (los neutrales se mantienen en hue 67; no se re-tintan en este plan).

- [ ] **Step 7: Verificar tipos y build**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 8: Revisión visual**

Run: `npm run dev` y abrir `/`, `/login` y `/dashboard` en dark y light.
Expected: botones, logo, enlaces y focus ring ahora en verde esmeralda; texto legible en ambos temas. Los badges de estado siguen con sus colores (verde/rojo/azul/ámbar).

- [ ] **Step 9: Commit**

```bash
git add app/globals.css
git commit -m "feat: adoptar accent esmeralda en los tokens de color"
```

---

## Task 2: Componente `Tabs`

**Files:**
- Create: `components/ui/tabs.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: string; count?: number };

export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              active
                ? "bg-elevated text-text shadow-e1"
                : "text-muted hover:text-text",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="tabular font-mono text-[0.6875rem] text-faint">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores ni warnings.

- [ ] **Step 3: Commit**

```bash
git add components/ui/tabs.tsx
git commit -m "feat: añadir componente Tabs (pestañas tipo pill)"
```

---

## Task 3: Componente `StatTile`

**Files:**
- Create: `components/ui/stat-tile.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { cn } from "@/lib/cn";

export type StatTone = "accent" | "success" | "danger" | "running";

const DOT: Record<StatTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  running: "bg-running",
};

export function StatTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone: StatTone;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 bg-surface px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", DOT[tone])} />
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
          {label}
        </span>
      </div>
      <p className="tabular text-[1.75rem] font-semibold leading-none tracking-tight text-text">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-medium text-faint">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/ui/stat-tile.tsx
git commit -m "feat: añadir componente StatTile"
```

---

## Task 4: Componente `BreakdownBar`

**Files:**
- Create: `components/ui/breakdown-bar.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
export function BreakdownBar({
  label,
  value,
  max,
  caption,
}: {
  label: string;
  value: number;
  max: number;
  caption?: string;
}): React.JSX.Element {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular font-mono text-faint">
          {value}
          {caption ? <span className="opacity-60"> · {caption}</span> : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/ui/breakdown-bar.tsx
git commit -m "feat: añadir componente BreakdownBar"
```

---

## Task 5: Componente `StepTimeline`

**Files:**
- Create: `components/runs/step-timeline.tsx`

Este componente reemplaza la lista `<ol>` de `StepRow` de `test-run-detail.tsx`. Porta el contenido completo de cada fila (acción, badge adaptativo, selector, valor, duración, error, captura) y le añade el marcador con línea conectora del prototipo.

- [ ] **Step 1: Crear el componente**

```tsx
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ImageIcon } from "@/components/ui/icons";

export type TimelineStep = {
  id: string;
  position: number;
  action: string;
  selector: string | null;
  value: string | null;
  status: string;
  error_message: string | null;
  screenshot_url: string | null;
  duration_ms: number | null;
};

const MARKER: Record<string, string> = {
  passed: "border-success bg-success",
  failed: "border-danger bg-danger",
  corriendo: "border-running bg-bg",
  pendiente: "border-border-strong bg-bg",
  skipped: "border-border-strong bg-surface-2",
};

export function StepTimeline({
  steps,
  onOpenScreenshot,
}: {
  steps: TimelineStep[];
  onOpenScreenshot: (url: string) => void;
}): React.JSX.Element {
  return (
    <ol className="flex flex-col px-4 py-2 sm:px-5">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const adaptive = step.selector?.startsWith("[adaptive]") ?? false;
        const selectorText = adaptive
          ? step.selector?.replace(/^\[adaptive\]\s*/, "")
          : step.selector;
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-2 size-3 shrink-0 rounded-full border-2",
                  MARKER[step.status] ?? "border-border-strong bg-surface-2",
                  step.status === "corriendo" && "animate-pulse-dot",
                )}
              />
              {!last ? <span className="w-px flex-1 bg-border" /> : null}
            </div>
            <div className="min-w-0 flex-1 pb-4 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-accent-text">
                  {step.action}
                </code>
                {adaptive ? <Badge tone="accent">adaptativo</Badge> : null}
                {selectorText ? (
                  <span className="min-w-0 truncate font-mono text-xs text-muted">
                    {selectorText}
                  </span>
                ) : null}
                {step.value ? (
                  <span className="min-w-0 truncate font-mono text-xs text-faint">
                    → {step.value}
                  </span>
                ) : null}
                {step.duration_ms !== null ? (
                  <span className="tabular ml-auto shrink-0 font-mono text-[0.6875rem] text-faint">
                    {step.duration_ms} ms
                  </span>
                ) : null}
              </div>
              {step.error_message ? (
                <p className="mt-1.5 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger-text">
                  {step.error_message}
                </p>
              ) : null}
              {step.screenshot_url ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenScreenshot(step.screenshot_url as string)
                  }
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent-text transition-opacity hover:opacity-80"
                >
                  <ImageIcon size={12} />
                  Ver captura
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

Nota: no lleva directiva `"use client"` — se consume desde `test-run-detail.tsx`, que ya es un client component (igual que el `StepRow` actual, definido hoy en ese mismo archivo).

- [ ] **Step 2: Verificar tipos y lint**

Run: `npm run typecheck && npm run lint`
Expected: sin errores. (El componente aún no se usa; se conecta en Task 11.)

- [ ] **Step 3: Commit**

```bash
git add components/runs/step-timeline.tsx
git commit -m "feat: añadir componente StepTimeline"
```

---

## Task 6: Componente `TypeChip`

**Files:**
- Create: `components/runs/type-chip.tsx`

Extrae a un componente el patrón de chip de tipo de prueba que hoy está inline en `new-test-run-form.tsx:211-231`.

- [ ] **Step 1: Crear el componente**

```tsx
import { cn } from "@/lib/cn";

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

export function TypeChip({
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  label: string;
  icon: IconComponent;
  active: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors duration-150",
        active
          ? "border-accent bg-accent-subtle text-text"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
      )}
    >
      <Icon
        size={16}
        className={active ? "text-accent-text" : "text-faint"}
      />
      <span className="font-medium">{label}</span>
    </button>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npm run typecheck && npm run lint`
Expected: sin errores. (Se conecta en Task 10.)

- [ ] **Step 3: Commit**

```bash
git add components/runs/type-chip.tsx
git commit -m "feat: añadir componente TypeChip"
```

---

## Task 7: Restyle del shell (sidebar + topbar)

**Files:**
- Modify: `app/dashboard/_components/topbar.tsx`
- Modify: `app/dashboard/_components/sidebar-nav.tsx`

Referencia visual: `components.jsx` (`Sidebar`, líneas 96-152; `Topbar`, líneas 73-91) y `styles.css` (`.sidebar`, `.nav-item`, `.topbar`, `.crumb`).

- [ ] **Step 1: Añadir breadcrumbs al topbar**

En `topbar.tsx` (ya es `"use client"`), importar `usePathname` de `next/navigation` y derivar los breadcrumbs. Añadir, fuera del componente:

```tsx
const CRUMBS: { match: (p: string) => boolean; trail: string[] }[] = [
  { match: (p) => p === "/dashboard", trail: ["Panel", "Resumen"] },
  {
    match: (p) => p === "/dashboard/runs/new",
    trail: ["Panel", "Test runs", "Nuevo"],
  },
  {
    match: (p) =>
      /^\/dashboard\/runs\/[^/]+$/.test(p) && p !== "/dashboard/runs/new",
    trail: ["Panel", "Test runs", "Detalle"],
  },
  { match: (p) => p === "/dashboard/runs", trail: ["Panel", "Test runs"] },
];

function crumbsFor(pathname: string): string[] {
  return CRUMBS.find((c) => c.match(pathname))?.trail ?? ["Panel"];
}
```

Sustituir el placeholder `<div aria-hidden="true" className="hidden lg:block" />` por una nav de breadcrumbs visible solo en `lg`:

```tsx
const crumbs = crumbsFor(usePathname());
// ...
<nav aria-label="Ruta" className="hidden items-center gap-2 text-sm lg:flex">
  {crumbs.map((c, i) => (
    <span key={i} className="flex items-center gap-2">
      {i > 0 ? <span className="text-faint">/</span> : null}
      <span className={i === crumbs.length - 1 ? "text-text" : "text-muted"}>
        {c}
      </span>
    </span>
  ))}
</nav>
```

- [ ] **Step 2: Restilizar el sidebar**

En `sidebar-nav.tsx`, aplicar el tratamiento del prototipo sin cambiar la lista `NAV` ni la lógica `isActive`:
- Item activo: punto/ícono en accent, fondo `surface` y `shadow-e1` (ya cercano — refinar a la jerarquía del prototipo: borde sutil `border border-border` en el activo, ícono `text-accent`).
- Etiqueta de sección "Panel": estilo mono en mayúsculas con tracking amplio (ya presente — alinear con `.nav-section-label` del prototipo).
- Mantener el botón "Nuevo test run" (`buttonVariants()`), la marca (`Logo`) y el pie `Probe · entorno de demostración`.
- No añadir medidor de uso ni contadores sin datos.

- [ ] **Step 3: Verificar y revisar**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

Run: `npm run dev` — navegar por `/dashboard`, `/dashboard/runs`, `/dashboard/runs/new` y un detalle.
Expected: breadcrumbs correctos por ruta; estado activo del sidebar correcto; drawer móvil intacto.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/_components/topbar.tsx app/dashboard/_components/sidebar-nav.tsx
git commit -m "feat: rediseñar el shell del dashboard con breadcrumbs"
```

---

## Task 8: Restyle del Resumen

**Files:**
- Modify: `app/dashboard/page.tsx`

Referencia visual: `screens.jsx` (`ScreenResumen`, líneas 26-184) y `styles.css`.

- [ ] **Step 1: Reemplazar `StatCell` por `StatTile`**

En `page.tsx`, eliminar el componente local `StatCell` y el mapa `DOT` (líneas 17-46). Importar `StatTile`:

```tsx
import { StatTile } from "@/components/ui/stat-tile";
```

Sustituir el grid de `StatCell` por cuatro `StatTile` con los mismos datos (`stats.total` tone `accent`, `stats.completados` tone `success`, `stats.fallidos` tone `danger`, `stats.activos` tone `running`), conservando el contenedor `overflow-hidden rounded-lg border` con `grid grid-cols-2 gap-px bg-border lg:grid-cols-4`.

- [ ] **Step 2: Computar el breakdown por tipo**

Añadir imports:

```tsx
import {
  TEST_TYPES,
  TEST_TYPE_LABELS,
} from "@/lib/validation/test-run";
import { BreakdownBar } from "@/components/ui/breakdown-bar";
```

Tras calcular `rows`, añadir:

```tsx
const breakdown = TEST_TYPES.map((t) => {
  const ofType = rows.filter((r) => r.test_type === t);
  const passed = ofType.filter((r) => r.status === "completado").length;
  return {
    type: t,
    label: TEST_TYPE_LABELS[t],
    count: ofType.length,
    passRate: ofType.length > 0 ? Math.round((passed / ofType.length) * 100) : 0,
  };
}).filter((b) => b.count > 0);
const breakdownMax = Math.max(1, ...breakdown.map((b) => b.count));
```

- [ ] **Step 3: Añadir la sección de dos columnas**

Reorganizar el cuerpo (cuando `rows.length > 0`) en: fila de `StatTile`, luego una grid de dos columnas — a la izquierda la tabla "Actividad reciente" ya existente (`RunListHeader` + `RunRow`), a la derecha una `Card` con título "Por tipo de prueba" que renderiza un `BreakdownBar` por cada entrada de `breakdown` (`value={b.count}`, `max={breakdownMax}`, `caption={`${b.passRate}%`}`). Usar `grid-cols-1 lg:grid-cols-[1.6fr_1fr]`.

- [ ] **Step 4: Añadir la sección de atajos**

Bajo la grid, una sección "Atajos" con tres tarjetas-enlace a `/dashboard/runs/new` (ej.: "Probar un login", "Validar checkout", "Generar suite desde URL"). Portar el estilo de `ShortcutCard` de `screens.jsx:173-184` con clases Tailwind y tokens (ícono en caja `bg-accent-subtle text-accent-text`, flecha `ArrowRight`). Usar los íconos ya existentes en `components/ui/icons.tsx` (`Shield`, `Bolt`, `Sparkles`/`Search`).

- [ ] **Step 5: Verificar y revisar**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

Run: `npm run dev` — abrir `/dashboard` en dark y light, con y sin datos.
Expected: stat tiles, breakdown y atajos correctos; `EmptyState` intacto cuando no hay runs.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: rediseñar la pantalla de Resumen"
```

---

## Task 9: Restyle de Test runs (lista)

**Files:**
- Modify: `app/dashboard/runs/_components/runs-table.tsx`
- Modify: `app/dashboard/runs/_components/run-list.tsx`

Referencia visual: `screens.jsx` (`ScreenRuns`, líneas 189-267) y `styles.css` (`.table`, `.tabs`, `.input-with-icon`).

- [ ] **Step 1: Sustituir el `<Select>` de estado por `Tabs`**

En `runs-table.tsx`, importar `Tabs` y `type TabItem` de `@/components/ui/tabs`. Reemplazar el `<Select>` de estado por un `<Tabs>` con cuatro items: `todos`, `completado`, `fallido`, `activo`. Calcular los `count` por item desde `runs`. Mantener el `<Select>` de tipo y el `<Input>` de búsqueda.

Ajustar el filtro `filtered`: para el item `activo`, la condición es `run.status === "pendiente" || run.status === "corriendo"`; para `completado`/`fallido`, igualdad exacta; para `todos`, sin filtro de estado. Los runs `cancelado` solo aparecen bajo `todos` (documentado en el spec). Mantener `query` y `type` igual.

```tsx
const STATUS_TABS: TabItem[] = [
  { id: "todos", label: "Todos" },
  { id: "completado", label: "Completados" },
  { id: "fallido", label: "Fallidos" },
  { id: "activo", label: "En curso" },
];
```

- [ ] **Step 2: Restilizar la tabla**

En `run-list.tsx`, refinar `RunListHeader` y `RunRow` al lenguaje del prototipo (cabecera mono en mayúsculas, hover de fila `hover:bg-surface-2` ya presente, badges de estado restilizados vía `run-status.tsx` si hace falta). No cambiar `COLS`, `toRunListItem`, los tipos exportados ni `RunListSkeleton`.

- [ ] **Step 3: Verificar y revisar**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

Run: `npm run dev` — abrir `/dashboard/runs`, probar tabs, búsqueda y filtro de tipo.
Expected: filtrado correcto; conteos por tab correctos; `EmptyState` "Sin coincidencias" intacto.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/runs/_components/runs-table.tsx app/dashboard/runs/_components/run-list.tsx
git commit -m "feat: rediseñar la lista de test runs con filtros por tabs"
```

---

## Task 10: Restyle del formulario de nuevo run

**Files:**
- Modify: `app/dashboard/runs/new/_components/new-test-run-form.tsx`

Referencia visual: `screens.jsx` (`ScreenNew`, líneas 272-469) y `styles.css` (`.card`, `.card-h`, `.chip`, `.field`).

- [ ] **Step 1: Usar `TypeChip` para la grid de tipos**

Importar `TypeChip` de `@/components/runs/type-chip`. Reemplazar el `<button>` inline del grid de tipos (líneas 211-231) por `<TypeChip>` (`label={TEST_TYPE_LABELS[type]}`, `icon={TYPE_META[type].icon}`, `active`, `onSelect={() => setTestType(type)}`). El grid contenedor y `TYPE_META` se conservan.

- [ ] **Step 2: Restilizar las secciones del formulario**

Aplicar al componente `FormSection` el tratamiento del prototipo: cabecera de sección con título + descripción + badge ("paso 0N/04" o "campos cifrados"), separadores. Numerar las secciones (Objetivo, Tipo de prueba, Datos, Instrucción). No cambiar la lógica del formulario: `buildPayload`, `handleSubmit`, los estados por tipo y los campos dinámicos quedan idénticos en comportamiento.

- [ ] **Step 3: Chips de sugerencias del prompt (opcional, solo cliente)**

Bajo el `Textarea` de instrucción, añadir chips que anexan texto al `extraPrompt` (ej.: `setExtraPrompt((p) => (p ? p + " " : "") + sugerencia)`). Es puramente cliente; no toca el payload ni el backend. No incluir la "Configuración del runner" del prototipo (navegador/dispositivo/reintentos): el endpoint no la soporta.

- [ ] **Step 4: Verificar y revisar**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

Run: `npm run dev` — abrir `/dashboard/runs/new`, cambiar de tipo, enviar el formulario.
Expected: chips de tipo funcionan; campos dinámicos por tipo correctos; el submit sigue creando el run y redirige a `/dashboard/runs/[id]`.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/runs/new/_components/new-test-run-form.tsx
git commit -m "feat: rediseñar el formulario de nuevo test run"
```

---

## Task 11: Restyle del detalle del run

**Files:**
- Modify: `app/dashboard/runs/[id]/_components/test-run-detail.tsx`

Referencia visual: `screens.jsx` (`ScreenDetail`, líneas 485-673; `ScreenLive`, líneas 712-879) y `styles.css` (`.timeline`, `.tl-*`).

⚠️ **No tocar** la lógica de datos: el `useEffect` de suscripción Realtime, `refetch`, `caseIdsRef`, el `useEffect` de reconciliación (intervalo 3s), `stepsByCase`, `counts`, `totalDurationMs` y el `useEffect` de cierre con Escape se conservan **exactamente**. Solo cambia el marcado.

- [ ] **Step 1: Usar `StepTimeline` en las tarjetas de caso**

Importar `StepTimeline` de `@/components/runs/step-timeline`. En el `.map` de `cases`, sustituir el `<ol className="divide-y...">` de `StepRow` por `<StepTimeline steps={list} onOpenScreenshot={setOpenScreenshot} />`. Eliminar el componente local `StepRow` y el mapa `DOT_TONE` (líneas 403-474), ya portados a `StepTimeline`. El tipo local `TestStep` es estructuralmente compatible con `TimelineStep`, así que `list` se pasa sin cambios.

- [ ] **Step 2: Restilizar el header del run y la barra de progreso en vivo**

Refinar la `Card` de encabezado (estado, métricas `Stat`, duración, `error_message`) al lenguaje del prototipo. Cuando `isActive` es `true`, añadir una barra de progreso derivada del conteo real de pasos: `passed+failed` sobre el total de `steps` (o sobre `counts` ya calculado). No añadir pestañas Logs/Network ni preview de navegador (sin datos — ver spec §5).

- [ ] **Step 3: Restilizar el visor de captura**

Aplicar el tratamiento visual del prototipo al lightbox (`openScreenshot`), conservando el comportamiento (cierre con Escape y clic en backdrop, `aria-modal`).

- [ ] **Step 4: Verificar y revisar**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

Run: `npm run dev` — abrir un run completado y, si es posible, lanzar uno nuevo y verlo en vivo.
Expected: timeline con marcadores y línea conectora; los pasos se pueblan en vivo vía Realtime; el lightbox abre/cierra; reconciliación intacta.

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/runs/[id]/_components/test-run-detail.tsx"
git commit -m "feat: rediseñar el detalle del run con timeline de pasos"
```

---

## Task 12: Actualizar `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (sección "Sistema de diseño y UI")

- [ ] **Step 1: Reescribir la regla de color**

Sustituir el último bullet de la sección (el que empieza "El accent (naranja arcilla)...") por:

```markdown
- El accent es verde esmeralda. `accent` y `success` comparten la familia
  verde y se distinguen por componente: los estados de prueba viven en badges
  (píldora con punto + etiqueta), el accent vive en botones llenos y enlaces.
  No uses `accent` para el texto de un estado ni `success` para acciones
  primarias.
```

- [ ] **Step 2: Registrar los componentes nuevos**

En el bullet de "Componentes reutilizables", añadir a la lista de `components/ui/`: `Tabs`, `StatTile`, `BreakdownBar`. Añadir una frase: los componentes específicos de runs viven en `components/runs/` (`StepTimeline`, `TypeChip`, `run-status`).

- [ ] **Step 3: Verificar coherencia**

Releer la sección "Sistema de diseño y UI": no debe quedar ninguna mención a "naranja" ni a accent separado de success.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: actualizar CLAUDE.md al sistema de color esmeralda"
```

---

## Task 13: Eliminar los archivos de prototipo y verificación final

**Files:**
- Delete: `app.jsx`, `components.jsx`, `screens.jsx`, `styles.css`, `tweaks-panel.jsx` (raíz del repo)
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Eliminar los cinco archivos de prototipo**

Estos archivos no están versionados (eran insumo de diseño). Eliminarlos:

```powershell
Remove-Item app.jsx, components.jsx, screens.jsx, styles.css, tweaks-panel.jsx
```

- [ ] **Step 2: Revertir la exclusión de ESLint**

En `eslint.config.mjs`, eliminar del array de `globalIgnores` las cuatro entradas añadidas en Task 1 (`app.jsx`, `components.jsx`, `screens.jsx`, `tweaks-panel.jsx`). El array vuelve a su estado original (`.next/**`, `out/**`, `build/**`, `next-env.d.ts`).

- [ ] **Step 3: Verificación final completa**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores ni warnings (ya sin los `.jsx` de prototipo).

Run: `npm run build`
Expected: build de producción exitoso.

Run: `npm test`
Expected: la suite de tests de API pasa (el rediseño no toca rutas de API; debe seguir verde).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: revertir la exclusión de ESLint tras eliminar el prototipo"
```

- [ ] **Step 5: Confirmar el estado del repo**

Run: `git status`
Expected: los cinco archivos de prototipo ya no aparecen; el árbol de trabajo está limpio. Su borrado no genera commit (no estaban versionados).

---

## Self-Review (cobertura del spec)

- **Higiene de lint** → Task 1 Step 1 excluye los `.jsx` de prototipo de ESLint (hoy rompen `npm run lint`); Task 13 Step 2 revierte la exclusión al borrarlos.
- **§3.1 tokens accent** → Task 1.
- **§3.2 colores de estado** → sin cambio de token (documentado); el mapeo se preserva en Tasks 9 y 11.
- **§3.3 consecuencia global** → verificada visualmente en Task 1 Step 5 (landing/login).
- **§3.4 CLAUDE.md** → Task 12.
- **§4.1 componentes nuevos** → Tabs (Task 2), StatTile (Task 3), BreakdownBar (Task 4), StepTimeline (Task 5), TypeChip (Task 6).
- **§4.2 restyle de primitivas** → el cambio de token (Task 1) cubre el color; los ajustes puntuales se hacen dentro de cada task de pantalla (7–11) sin cambiar APIs.
- **§4.3 iconos** → no se requieren íconos nuevos; los componentes y pantallas usan los ya presentes en `icons.tsx` (verificado contra el inventario de `components.jsx`).
- **§5 honestidad de datos** → widgets sin datos omitidos explícitamente en Tasks 8 (sin sparklines/cola), 10 (sin runner config) y 11 (sin Logs/Network/preview).
- **§6.1–6.5 pantallas** → Shell (Task 7), Resumen (Task 8), Runs (Task 9), Nuevo (Task 10), Detalle (Task 11).
- **§7 enfoque** → orden de tasks: tokens → componentes → pantallas → CLAUDE.md → limpieza.
- **§8 lo que no se toca** → ninguna task modifica API/worker/queue/supabase/realtime; Task 11 lo refuerza explícitamente.
- **§9 criterios de aceptación** → verificados en Task 13 (typecheck/lint/build/test) y en las revisiones visuales por task.
