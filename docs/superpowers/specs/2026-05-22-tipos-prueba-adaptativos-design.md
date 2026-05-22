# Diseño — Todos los `test_type` 100% funcionales con heurística adaptativa

- **Fecha:** 2026-05-22
- **Estado:** Aprobado para planificación
- **Área:** `worker/lib/*` (nuevos módulos adaptativos), `worker/lib/execute-test-run.ts`, `worker/lib/gemini.ts`, `worker/test/*`, `FLUJOS-DE-PRUEBA.md`, `CLAUDE.md`

## Contexto

El worker ejecuta 6 tipos de prueba (`login`, `registro`, `busqueda`,
`navegacion`, `formulario`, `ecommerce`). Hoy solo dos están endurecidos con
**heurística adaptativa + verificación por comportamiento**:

- `login` → `worker/lib/adaptive-login.ts`
- `busqueda` → `worker/lib/adaptive-search.ts`

Ambos descartan los selectores literales que sugiere Gemini para los pasos
frágiles, usan detección tolerante a idioma/maquetado y **juzgan el resultado
por comportamiento** (cambió la URL, desapareció el campo, aparecieron nodos de
resultado nuevos), no por aserciones literales. Marcan sus pasos con el prefijo
`[adaptive]` y traen tests puros + de integración con Chromium real.

Los otros cuatro tipos (`registro`, `navegacion`, `formulario`, `ecommerce`)
ejecutan **literalmente** los selectores que adivina Gemini. Esto los hace
frágiles: rompen ante cambios de idioma, maquetado o estructura, y —peor— pueden
dar **falsos positivos** (verde cuando el flujo real no ocurrió) porque su
"verificación" es la mera presencia de un elemento que Gemini supuso.

## Problema

El usuario quiere los 6 tipos "100% funcionales": que ejecuten el flujo completo
de forma robusta y reporten un resultado **veraz**. Hoy 4 de 6 no cumplen porque:

1. Dependen de selectores adivinados por la IA, frágiles por definición.
2. Su criterio de éxito no verifica comportamiento real → falsos positivos.
3. No tienen tests de integración que prueben los caminos frágiles.

## Objetivos

- Dar a `registro`, `formulario`, `ecommerce` y `navegacion` su propio módulo
  adaptativo, siguiendo **exactamente** el patrón ya establecido (detectores
  puros testeables + orquestación con verificación por comportamiento + prefijo
  `[adaptive]` + tests puros e integración).
- Extraer a un módulo común los helpers ya duplicados entre `adaptive-login` y
  `adaptive-search`, sin alterar el comportamiento de esos dos.
- Demostrar cada tipo en **verde end-to-end** contra sitios demo canónicos de QA.
- Entregar `FLUJOS-DE-PRUEBA.md` (raíz, español) explicando cada tipo:
  cómo funciona técnicamente + walkthrough de UX (URL → tiempo → respuesta).

## Fuera de alcance

- Captchas, MFA, OAuth, 2FA.
- Pasarelas de pago reales con iframes de terceros (Stripe Elements, PayPal SDK).
  `ecommerce` cubre campos de pago **inline** en el DOM; los iframes de pago
  quedan documentados como límite conocido.
- Refactor del motor de login/búsqueda existente (solo se extraen helpers
  compartidos para consumo de los módulos nuevos; el código probado no cambia de
  comportamiento).
- UI nueva en el formulario de creación de runs.
- Garantizar verde contra una URL **arbitraria**: ningún motor lo logra. La meta
  es robustez + veracidad + demos verdes reproducibles en sitios conocidos.

## Principio rector (la regla de oro de QA)

**La verificación por comportamiento es siempre el árbitro.** Cualquier
relajación que hagamos para que el flujo avance (bypass de validación nativa,
detección tolerante, etc.) NO puede inventar un verde: si el flujo real no
ocurrió, la verificación por comportamiento debe seguir detectando el fallo. Cada
módulo nuevo prueba explícitamente su **trampa de falso positivo** (igual que
`adaptive-search` prueba la página con contenedores `result/product` cuya
búsqueda no hace nada).

---

## Diseño general

Se replica el patrón de `adaptive-search.ts` para cada tipo nuevo:

1. **Funciones puras** (regex/detectores) → 100% unit-testeables sin navegador.
2. **Funciones que tocan el DOM** (find* / verify* / macros) → cubiertas por
   tests de integración con Chromium real contra fixtures HTTP efímeras.
3. **Cableado** en `execute-test-run.ts` con una rama `ctx.testType === ...`.
4. **Reporte** con prefijo `[adaptive]` en `selector` y la URL/dato real en
   `value`.

### Módulo compartido — `worker/lib/adaptive-common.ts`

Extrae lo ya duplicado entre login y search, para consumo de los módulos nuevos:

```ts
export const VISIBILITY_PROBE_TIMEOUT_MS: number;
export async function pickFirstVisible(candidates: Locator[], label: string): Promise<Locator>;
export async function pickFirstVisibleOrNull(candidates: Locator[]): Promise<Locator | null>;

// Detección de error/éxito por comportamiento, reutilizable.
export const ERROR_SELECTORS: string[];
export async function readVisibleErrorText(page: Page): Promise<string | undefined>;
export async function detectNativeValidationBlock(page: Page): Promise<string | undefined>;

// Texto que delata éxito genérico (gracias / éxito / enviado / creado / ...).
export const SUCCESS_TEXT_REGEX: RegExp;
export async function isSuccessTextVisible(page: Page): Promise<boolean>;

// Submit genérico con verbos ampliables.
export const SUBMIT_VERBS: string[]; // enviar, submit, guardar, continuar, aceptar, confirmar, ...
export async function findGenericSubmit(page: Page, extraVerbs?: string[]): Promise<Locator>;
```

`adaptive-login.ts` y `adaptive-search.ts` **no se modifican** en esta tanda
(mantienen sus copias) para no arriesgar regresión; la deduplicación de esos dos
queda como mejora opcional futura. `adaptive-common` nace consumido por los
módulos nuevos.

---

## Fases

El trabajo se separa en fases por complejidad y dependencias. Cada fase es un
ciclo cerrado: implementación + tests puros + tests de integración + cableado +
verificación en vivo (Playwright MCP) + su sección en `FLUJOS-DE-PRUEBA.md`.

### Fase 1 — Fundación compartida + `navegacion`

Establece `adaptive-common.ts` con el caso de uso más simple como primer
consumidor.

**`worker/lib/adaptive-navegacion.ts`** — smoke test por comportamiento.

`navegacion` es un smoke/health test: confirma que la app **carga y renderiza**,
opcionalmente siguiendo una instrucción libre de navegación. No verifica
contenido específico (para eso están los otros tipos).

```ts
export type PageHealth = {
  healthy: boolean;
  finalUrl: string;
  title: string;
  reason: string;
};
// Pura: juzga si el contenido recibido parece una página de error.
export function looksLikeErrorPage(title: string, bodyText: string): boolean;
// DOM: readyState completo, <title> no vacío, body con contenido real,
// no parece página de error, sin exceso de errores JS críticos.
export async function verifyPageHealthy(page: Page): Promise<PageHealth>;
// Click tolerante: intenta el selector literal; si falla, cae a buscar un
// enlace/botón por el texto contenido en el selector.
export async function clickAdaptive(page: Page, selector: string, timeoutMs: number): Promise<void>;
```

Cableado en `execute-test-run.ts`, solo `testType === "navegacion"`:

- `goto`: igual que hoy (con `assertSafeNavigationUrl`).
- `click`: usa `clickAdaptive` (literal → fallback por texto). Marca
  `[adaptive] click tolerante` cuando usa el fallback.
- `expect_visible` / `expect_text` / `expect_url`: se sustituyen por
  `verifyPageHealthy`. Si la página está sana, pasa con
  `selector = "[adaptive] navegación verificada por salud de página"` y la URL
  real en `value`. Si no, falla con el `reason` (p. ej. "la página devolvió un
  documento de error / sin contenido renderizable").

Trampa de falso positivo cubierta: una ruta que responde 404/"Not Found" con
cuerpo mínimo debe dar `healthy: false`.

Demo verde: `https://the-internet.herokuapp.com/`.

### Fase 2 — `formulario`

**`worker/lib/adaptive-formulario.ts`** — llenado genérico de formularios.

El usuario provee `test_data.fields` como líneas `etiqueta: valor`. La heurística
resuelve cada campo por su etiqueta (tolerante a idioma/maquetado), lo llena
según su tipo de control, envía y **verifica el envío por comportamiento**.

```ts
export type FieldPair = { label: string; value: string };
// Pura: parsea "label: value" / "label = value", una por línea, ignora vacías,
// corta en el primer separador.
export function parseFields(raw: string): FieldPair[];

// Pura: ¿el selector/paso de Gemini huele al botón de envío del formulario?
export function isFormSubmitSelector(selector?: string | null): boolean;

// Pura: ¿el valor representa un booleano para checkbox/radio? (sí/no/true/false/x).
export function asBoolean(value: string): boolean | null;

export type FormOutcome = { success: boolean; finalUrl: string; reason: string };

// DOM: resuelve el control de un campo por label/placeholder/name/id/aria.
export async function resolveField(page: Page, label: string): Promise<Locator | null>;
// DOM: llena el control según su tag/type (text, textarea, select, checkbox,
// radio, date, number).
export async function fillField(control: Locator, value: string): Promise<void>;
// DOM: orquesta el flujo — barre todos los pares, resuelve+llena cada uno
// (idempotente), envía con findGenericSubmit y verifica.
export async function fillAndSubmitForm(
  page: Page,
  fields: FieldPair[],
  timeoutMs: number,
): Promise<FormOutcome>;
```

Modelo de ejecución (consistente con búsqueda: la macro corre en el submit):

- `fill`: best-effort. Intenta el selector literal de Gemini; si falla, intenta
  `resolveField` por la etiqueta derivada de la descripción del paso. Nunca
  hace fallar el caso por sí solo: el árbitro es el submit.
- `click` que huele a submit (`isFormSubmitSelector`): dispara
  `fillAndSubmitForm` con los pares de `test_data`. Antes de enviar hace un
  **barrido de completitud** (rellena adaptativamente cualquier campo aún
  vacío), envía y verifica. Marca `[adaptive] formulario enviado y verificado`.

`verifyFormSubmit` (dentro de `fillAndSubmitForm`) = éxito por comportamiento:
URL cambió, o mensaje de éxito visible (`SUCCESS_TEXT_REGEX`), o el formulario
desapareció. Fallo si tras enviar aparece un error visible
(`readVisibleErrorText`) o un bloqueo de validación nativa
(`detectNativeValidationBlock`), o si no hay ninguna señal en el budget.

Trampa de falso positivo cubierta: un `<form>` que al enviar no hace nada
(`preventDefault` sin feedback) debe dar `success: false`.

Demo verde: `https://httpbin.org/forms/post` (POST que devuelve un eco JSON
determinista de los campos enviados → cambio de URL + contenido verificable).

### Fase 3 — `registro`

**`worker/lib/adaptive-registro.ts`** — registro de cuenta.

Espeja `login` (reusa `findEmailField`/`findPasswordField` vía import) y añade
los campos propios del registro. Tolera que falten campos (p. ej. apps sin
"confirmar contraseña").

```ts
export function isNameFillSelector(selector?: string | null): boolean;
export function isConfirmPasswordSelector(selector?: string | null): boolean; // confirm/repeat/repetir/again/verificar
export function isRegisterSubmitSelector(selector?: string | null): boolean;  // registrar/crear cuenta/sign up/...

export async function findNameField(page: Page): Promise<Locator | null>;
// 2+ inputs password → el segundo es "confirmar"; si no, por tokens. Puede no existir.
export async function findConfirmPasswordField(page: Page): Promise<Locator | null>;

export type RegisterOutcome = LoginOutcome; // mismo contrato de comportamiento
export async function registerAndVerify(
  page: Page,
  data: { name: string; email: string; password: string; confirmPassword: string },
  initialUrl: string,
  timeoutMs: number,
): Promise<RegisterOutcome>;
```

Cableado en `execute-test-run.ts`, solo `testType === "registro"`. Mismo modelo
por pasos que login:

- `fill`: enruta por detector — `isConfirmPasswordSelector` (antes que password),
  `isPasswordFillSelector`, `isNameFillSelector`, `isEmailFillSelector` (con
  relajación de validación nativa como en login). Campos no resueltos se omiten
  con marca, no fallan.
- `click` que huele a submit de registro: `findGenericSubmit` con verbos de
  registro → click → verificación por comportamiento (URL cambió / form
  desapareció / mensaje de éxito), con detección de error específico de registro
  ("el email ya está en uso", "usuario existente"). Abre **ventana de
  verificación** post-registro (igual que login) para los `expect_*` siguientes.

Marcas: `[adaptive] nombre`, `[adaptive] email/usuario`, `[adaptive] password`,
`[adaptive] confirmar password`, `[adaptive] submit registro`,
`[adaptive] verificado por comportamiento post-registro`.

Trampa de falso positivo cubierta: registro con email duplicado → la app muestra
error → `success: false` aunque el form siga en pantalla.

Demo verde: `https://demo.realworld.io/#/register` (Conduit). Se registra con
**email/usuario aleatorios por corrida** (sufijo timestamp) → redirige al feed.
Conduit no tiene campo "confirmar"; el flujo debe pasar igual omitiéndolo.

### Fase 4 — `ecommerce`

**`worker/lib/adaptive-ecommerce.ts`** — compra completa (macro multi-etapa).

El más complejo y el menos generalizable. Se modela como una **macro por
etapas** con un checkpoint de comportamiento en cada una. El criterio de éxito
final, no negociable, es **detectar la confirmación de la orden**.

```ts
// Detectores puros de intención de paso:
export function isAddToCartSelector(s?: string | null): boolean;   // add to cart/agregar al carrito/añadir/comprar/buy
export function isCheckoutNavSelector(s?: string | null): boolean; // checkout/carrito/cart/realizar pedido/finalizar
export function isConfirmOrderSelector(s?: string | null): boolean;// purchase/place order/pagar/confirmar compra
export function isPaymentFieldSelector(s?: string | null): boolean;// card/tarjeta/cvc/cvv/expiry/vencimiento
// Pura: parte "MM/AA" en {month, year} para apps con campos separados.
export function splitExpiry(expiry: string): { month: string; year: string };

export type StageOutcome = { success: boolean; reason: string };
export type OrderOutcome = { success: boolean; finalUrl: string; reason: string };

export async function findAddToCart(page: Page): Promise<Locator | null>;
export async function addToCartStage(page: Page, timeoutMs: number): Promise<StageOutcome>; // maneja dialog/alert
export async function goToCheckoutStage(page: Page, timeoutMs: number): Promise<StageOutcome>;
export async function fillPaymentStage(page: Page, data: EcommerceData, timeoutMs: number): Promise<StageOutcome>;
export async function confirmOrderAndVerify(page: Page, timeoutMs: number): Promise<OrderOutcome>;
```

Cableado en `execute-test-run.ts`, solo `testType === "ecommerce"`, por
intención de paso:

- `click` add-to-cart → `addToCartStage` (acepta el `dialog`/alert "producto
  agregado"; verifica incremento del contador del carrito o aparición de
  confirmación). `[adaptive] agregar al carrito`.
- `click` checkout/cart-nav → `goToCheckoutStage` (navega a carrito y avanza a
  checkout). `[adaptive] ir a checkout`.
- `fill` de pago/datos → `fillPaymentStage` adaptativo (mapea `card`→campo de
  tarjeta, `expiry`→expiry o `splitExpiry` a mes/año, `cvc`→cvc/cvv, `email`→
  email; reusa `resolveField` de formulario). `[adaptive] datos de pago`.
- `click` confirmar/comprar → `confirmOrderAndVerify`. Éxito **solo** si se
  detecta confirmación de orden (`SUCCESS_TEXT_REGEX` ampliado: "thank you for
  your purchase", "gracias por tu compra", "order placed", "compra exitosa", +
  SweetAlert). `[adaptive] confirmar orden`.

Trampa de falso positivo cubierta: una tienda con producto y botón pero cuyo
"confirmar" no genera ninguna confirmación → `success: false`.

Demo verde: `https://www.demoblaze.com/` — agregar producto → carrito → "Place
Order" → formulario con tarjeta/mes/año inline → "Purchase" → SweetAlert "Thank
you for your purchase!". Coincide con nuestros datos `card`/`expiry`/`cvc`.

Límite documentado: tiendas con pago en iframe (Stripe/PayPal) quedan fuera; la
macro las reportará con un diagnóstico claro ("campos de pago en iframe, no
accesibles inline").

### Fase 5 — Documento + verificación en vivo + cierre

- Consolidar `FLUJOS-DE-PRUEBA.md` (raíz, español): una sección por tipo con
  **(a)** cómo funciona técnicamente y **(b)** walkthrough de UX — "el usuario
  pega `<URL demo>`, llena `<estos campos>`, en `~X s` obtiene `<este
  resultado>`". Los tiempos se **miden** en la verificación en vivo, no se
  inventan.
- Verificación en vivo con Playwright MCP de los 6 tipos contra sus demos,
  capturando tiempos reales (generación Gemini + ejecución por paso + total).
- Ajustes finos a `gemini.ts` si la verificación revela planes subóptimos por
  tipo (p. ej. afinar el `Objetivo:` de cada `test_type`).
- Actualizar `CLAUDE.md` con las nuevas secciones de detección adaptativa
  (registro, formulario, navegación, e-commerce) siguiendo el estilo de las de
  login/búsqueda.

---

## Archivos afectados

| Archivo | Cambio | Fase |
|---|---|---|
| `worker/lib/adaptive-common.ts` | **Nuevo.** Helpers compartidos. | 1 |
| `worker/lib/adaptive-navegacion.ts` | **Nuevo.** Smoke por comportamiento + click tolerante. | 1 |
| `worker/lib/adaptive-formulario.ts` | **Nuevo.** Resolución/llenado/verificación de formularios. | 2 |
| `worker/lib/adaptive-registro.ts` | **Nuevo.** Registro adaptativo. | 3 |
| `worker/lib/adaptive-ecommerce.ts` | **Nuevo.** Macro de compra multi-etapa. | 4 |
| `worker/lib/execute-test-run.ts` | Ramas por `testType` para los 4 tipos nuevos. | 1–4 |
| `worker/lib/gemini.ts` | Afinado opcional de objetivos por tipo. | 5 |
| `worker/test/adaptive-*.test.ts` | **Nuevos.** Unit de funciones puras. | 1–4 |
| `worker/test/adaptive-*.integration.test.ts` | **Nuevos.** Integración Chromium real. | 1–4 |
| `FLUJOS-DE-PRUEBA.md` | **Nuevo.** Documento técnico + UX. | 1–5 |
| `CLAUDE.md` | Secciones de detección adaptativa nuevas. | 5 |

## Plan de pruebas

Por cada módulo nuevo (espejo de `adaptive-search`):

- **Unit (Vitest):** funciones puras (detectores de selector, `parseFields`,
  `asBoolean`, `looksLikeErrorPage`, `splitExpiry`, regex de éxito/error). Casos
  positivos, negativos y **no-falsos-positivos**.
- **Integración (Vitest + Chromium real + servidor HTTP efímero):** caminos
  frágiles por tipo y, obligatoriamente, **la trampa de falso positivo** de cada
  tipo (form que no envía, navegación a página de error, registro con email
  duplicado, compra sin confirmación).
- **En vivo (Playwright MCP):** un flujo verde por tipo contra su demo canónico,
  para confirmar comportamiento real y medir tiempos para el documento.

Comandos: `npm test` (raíz, API), y los tests del worker con su runner Vitest
(`worker/vitest.config.ts`). `npm run typecheck` y `npm run lint` deben pasar
limpios (TS strict, sin `any`).

## Riesgos y mitigaciones

- **Falsos positivos** (verde sin flujo real) → mitigado por la regla de oro:
  verificación por comportamiento como árbitro + test de trampa por tipo.
- **`ecommerce` no generaliza** a toda tienda → alcance acotado a patrones
  comunes + límite de iframes documentado + demo verde reproducible (demoblaze).
- **Detección por tokens cortos** (p. ej. `cc`, `q`) → límites de palabra `\b` y
  atributos exactos, como ya hace login/búsqueda; cubierto por unit tests.
- **Demos externas caen o cambian** → los tests de integración corren contra
  fixtures locales (no dependen de la red); la verificación en vivo es
  complementaria, no parte del CI.
- **Regresión en login/búsqueda** → no se tocan; `adaptive-common` solo es
  consumido por los módulos nuevos.
