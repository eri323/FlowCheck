# Rediseño de la landing y rebranding a FlowCheck

Fecha: 2026-05-18
Estado: aprobado, listo para plan de implementación

## Resumen

Dos cambios entrelazados sobre la página pública (`/`):

1. **Rebranding**: el proyecto pasa de llamarse `Probe` a `FlowCheck`.
2. **Profundidad técnica entretejida**: la landing mantiene sus secciones
   actuales, pero cada bloque de producto gana una capa de detalle de
   ingeniería mediante un componente `<Callout>` nuevo. La página se lee como
   un producto real, mientras deja ver la profundidad técnica para quien la
   busca.

No se añaden ni se eliminan secciones. No se rediseña la dirección visual ni
los tokens de color.

## Contexto y decisiones

- **Nombre**: se eligió `FlowCheck` (estilo descriptivo) frente a `Probe`,
  `TestPilot`, `Testwright` y `SnapCheck`. El nombre mapea directamente al
  producto: el usuario describe un _flujo_ y el sistema lo _verifica_.
- **Estructura**: se eligió el enfoque "profundidad entretejida" — sin sección
  técnica dedicada; cada sección existente gana su capa técnica — frente a un
  capítulo "Bajo el capó" aislado o a un caso de estudio completo.
- **Tratamiento**: la capa técnica se materializa como un callout etiquetado
  ("Bajo el capó"), frente a una nota al pie en monospace o un artefacto de
  código embebido.
- **Público**: doble — se ve y se lee como producto real, pero señaliza la
  profundidad de ingeniería para un revisor técnico (portafolio).

## Parte 1 — Rebranding: Probe → FlowCheck

Cambio puramente textual. La marca gráfica del logo (el visor de corchetes en
`components/ui/logo.tsx`, función `Mark`) **no cambia**: solo se sustituye la
palabra.

Archivos a editar (6 archivos; `logo.tsx` y `layout.tsx` tienen 2
ocurrencias cada uno):

| Archivo                                        | Ocurrencia                                           |
| ---------------------------------------------- | ---------------------------------------------------- |
| `components/ui/logo.tsx`                       | Wordmark `Probe`; `aria-label="Probe — inicio"`      |
| `app/layout.tsx`                               | `metadata.title.default` y `metadata.title.template` |
| `app/_components/landing/hero.tsx`             | Frase del párrafo de subtítulo                       |
| `app/_components/landing/how-it-works.tsx`     | Frase del párrafo introductorio                      |
| `app/_components/landing/marketing-footer.tsx` | Línea de copyright                                   |
| `app/dashboard/_components/sidebar-nav.tsx`    | Texto del pie del sidebar                            |

Quedan **fuera de alcance**: `package.json`, `README`, y los documentos
históricos en `docs/superpowers/specs/` y `docs/superpowers/plans/` (son
registro y no se reescriben).

Los IDs de ancla (`#como-funciona`, `#tipos`, `#reporte`) y los enlaces de
navegación se mantienen sin cambios.

## Parte 2 — Componente `<Callout>`

Nuevo componente reutilizable en `components/ui/callout.tsx`.

- Export **nombrado** (`export function Callout`), sin export por defecto.
- Renderiza un `<aside>` no interactivo: borde redondeado, fondo
  `bg-accent-subtle`, borde `border-border`.
- Etiqueta corta en mayúsculas (texto pequeño, `tracking` amplio) en
  `text-accent-text`.
- Cuerpo del contenido en `text-muted`, tamaño de texto pequeño.
- Props:
  - `label?: string` — por defecto `"Bajo el capó"`.
  - `children: React.ReactNode` — el contenido del detalle técnico.
  - `className?: string` — para ajustes de espaciado en el sitio de uso.
- Usa **solo tokens semánticos** del sistema de diseño (`accent-subtle`,
  `accent-text`, `border`, `muted`). Sin colores ni escalas `zinc-*`
  hardcodeadas. Funciona en tema claro y oscuro sin lógica adicional.

TypeScript en modo strict, sin `any`.

## Parte 3 — Capa técnica por sección

La landing conserva sus 6 bloques: Hero → Cómo funciona → Tipos de prueba →
Reporte en vivo → CTA → Footer. Se integran **5 callouts**.

### Hero (`hero.tsx`)

Sin callout — ya tiene la insignia "Construido sobre Playwright y Gemini" y la
línea mono. Solo se aplica el rename en el cuerpo. La insignia y el componente
`ReportMock` no se tocan.

### Cómo funciona (`how-it-works.tsx`) — un `<Callout>` por paso

Cada uno de los 3 pasos existentes recibe un `<Callout>` debajo de su cuerpo:

- **Paso 1 · Describe el flujo**: "Cada tipo de prueba mantiene las
  credenciales separadas de tu instrucción libre; todo el input se valida con
  Zod antes de tocar nada."
- **Paso 2 · La IA genera los casos**: "Gemini responde con
  `responseMimeType: application/json`; el JSON se valida contra un contrato de
  tipos estricto antes de ejecutar un solo paso."
- **Paso 3 · Observa la ejecución en vivo**: "Un proceso worker independiente
  consume una cola BullMQ sobre Redis — los jobs de 30–60 s no bloquean las
  requests HTTP. 3 jobs concurrentes, 2 reintentos."

El layout de la grilla de 3 columnas se mantiene; el callout se ubica al final
de cada celda de paso.

### Tipos de prueba (`test-types.tsx`) — un `<Callout>` de sección

Debajo de la grilla de 6 tipos:

- "El tipo **Login** no ejecuta los selectores al pie de la letra: una
  heurística localiza el campo de identificador, la contraseña y el botón, y
  verifica el resultado por comportamiento. Tolera cualquier idioma y
  maquetado — un selector exótico no rompe la prueba."

### Reporte en vivo (`features.tsx`) — un `<Callout>` de sección

Junto al bloque de 3 features:

- "Supabase Realtime solo entrega eventos desde que el canal se suscribe,
  dejando un hueco de 1–3 s. FlowCheck lo cierra reconciliando contra la base
  de datos: Realtime es la vía rápida, el refetch es la garantía de
  correctitud."

### CTA (`cta-section.tsx`) y Footer (`marketing-footer.tsx`)

Sin callout. Solo el rename donde aplique.

## Copy

Refresco quirúrgico, no reescritura. Los títulos de sección actuales se
conservan. Solo cambian:

- Las 3 frases que mencionan `Probe`.
- El texto nuevo de los 5 callouts.

## Fuera de alcance

- No se rediseña `ReportMock` ni ningún otro visual existente.
- No se añaden ni eliminan secciones de la landing.
- No se toca el dashboard salvo el rename en `sidebar-nav.tsx`.
- No se modifican la paleta ni los tokens de `app/globals.css`.
- No se renombra `package.json` ni el `README`.

## Verificación

La landing es presentacional: no introduce endpoints nuevos, por lo que no
aplica el requisito de tests en `/tests/api/` de CLAUDE.md. La verificación es:

- `npm run typecheck` — sin errores, sin `any`.
- `npm run lint` — limpio.
- `npm run build` — compila sin errores.
- Revisión visual: landing en tema claro y oscuro; los 5 callouts legibles en
  ambos; layout correcto en móvil y escritorio.
- `grep` final de `Probe` en el código (excluyendo `docs/`) confirmando 0
  ocurrencias.

## Resumen del trabajo

1. Crear `components/ui/callout.tsx` (componente nuevo).
2. Aplicar el rename en los 6 archivos listados en la Parte 1.
3. Integrar `<Callout>` en `how-it-works.tsx` (×3), `test-types.tsx` (×1) y
   `features.tsx` (×1) con los textos de la Parte 3.
