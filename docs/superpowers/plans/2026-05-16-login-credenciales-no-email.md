# Login con credenciales no-email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear y ejecutar test-runs de login cuya credencial no es un email (CC / cédula / número de documento / username), de punta a punta.

**Architecture:** Dos partes. (1) Relajar la validación de la credencial de login en el formulario de test-run (`type=text` + schema Zod de identificador genérico). (2) Implementar la detección adaptativa del worker: ampliar la heurística de `adaptive-login.ts` con términos de documento, neutralizar la validación HTML5 nativa de la app bajo prueba al llenar, y diagnosticar bloqueos de validación nativa.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Zod, Playwright (Chromium), Vitest.

**Specs:**
- `docs/superpowers/specs/2026-05-16-login-credenciales-formulario-design.md` (formulario + validación)
- `docs/superpowers/specs/2026-05-15-login-credenciales-no-email-design.md` (worker adaptativo)

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `lib/validation/test-run.ts` | Schemas Zod de los test-runs | Modificar: `loginIdentifierSchema` nuevo |
| `tests/lib/validation/test-run.test.ts` | Unit tests del schema | Crear |
| `app/dashboard/_components/new-test-run-form.tsx` | Formulario de test-run | Modificar: campo de login |
| `lib/playwright/adaptive-login.ts` | Heurística adaptativa de login | Modificar: detección + funciones nuevas |
| `tests/lib/adaptive-login.test.ts` | Unit tests de funciones puras | Crear |
| `lib/playwright/execute-test-run.ts` | Runner de pasos Playwright | Modificar: rama `fill` |
| `CLAUDE.md` | Doc del proyecto | Modificar: sección "Detección adaptativa" |

---

## Task 1: Relajar la validación Zod de la credencial de login

**Files:**
- Modify: `lib/validation/test-run.ts`
- Test: `tests/lib/validation/test-run.test.ts` (crear)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/lib/validation/test-run.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestRunSchema } from "@/lib/validation/test-run";

const base = { target_url: "https://example.com" };

describe("createTestRunSchema — credencial de login", () => {
  it("acepta un login con credencial que no es email (CC / documento)", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "1098765432", password: "secreta123" },
    });
    expect(result.success).toBe(true);
  });

  it("acepta un login con credencial de tipo username", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "juan.perez", password: "secreta123" },
    });
    expect(result.success).toBe(true);
  });

  it("acepta un login con un email normal", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "admin@test.com", password: "secreta123" },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un login con credencial vacía", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "   ", password: "secreta123" },
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un login con credencial que tiene saltos de línea", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "usuario\ninyectado", password: "secreta123" },
    });
    expect(result.success).toBe(false);
  });

  it("sigue rechazando un email inválido en el flujo de registro", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "registro",
      test_data: {
        name: "Juan",
        email: "1098765432",
        password: "secreta123",
        confirmPassword: "secreta123",
      },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/lib/validation/test-run.test.ts`
Expected: FAIL — los casos "no es email" / "username" fallan porque `loginDataSchema.email` aún usa `z.email()`.

- [ ] **Step 3: Implementar el schema de identificador**

En `lib/validation/test-run.ts`, justo antes de `const loginDataSchema = ...` (línea ~32), insertar:

```ts
const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, "La credencial es obligatoria")
  .max(320, "La credencial es demasiado larga")
  .refine((v) => !/[\r\n\t]/.test(v), "La credencial no puede tener saltos de línea");
```

Y reemplazar el campo `email` dentro de `loginDataSchema`:

```ts
const loginDataSchema = z.object({
  email: loginIdentifierSchema,
  password: passwordSchema,
});
export type LoginData = z.infer<typeof loginDataSchema>;
```

NO tocar `registroDataSchema` ni `ecommerceDataSchema`: su `email: z.email("Email inválido").max(320)` se mantiene.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/lib/validation/test-run.test.ts`
Expected: PASS — los 6 casos pasan.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/test-run.ts tests/lib/validation/test-run.test.ts
git commit -m "feat: aceptar credenciales no-email en la validación de login"
```

---

## Task 2: Cambiar el campo de credencial en el formulario

**Files:**
- Modify: `app/dashboard/_components/new-test-run-form.tsx`

No hay infraestructura de tests de componentes (`vitest` corre en `environment: "node"`), así que esta tarea se verifica manualmente.

- [ ] **Step 1: Modificar el campo de login**

En `app/dashboard/_components/new-test-run-form.tsx`, dentro del bloque `testType === "login"` (líneas ~176-187), reemplazar:

```tsx
        <DynamicSection title="Credenciales" secure>
          <Field label="Email" htmlFor="login-email" error={fieldError("test_data")}>
            <input
              id="login-email"
              type="email"
              required
              value={login.email}
              onChange={(e) => setLogin({ ...login, email: e.target.value })}
              placeholder="admin@test.com"
              className={inputClass}
            />
          </Field>
```

por:

```tsx
        <DynamicSection title="Credenciales" secure>
          <Field
            label="Email o usuario"
            htmlFor="login-email"
            error={fieldError("test_data")}
          >
            <input
              id="login-email"
              type="text"
              required
              value={login.email}
              onChange={(e) => setLogin({ ...login, email: e.target.value })}
              placeholder="admin@test.com, usuario o CC"
              className={inputClass}
            />
          </Field>
```

NO cambiar la clave de estado `login.email` ni el tipo `LoginState`. NO tocar las secciones `registro` ni `ecommerce`.

- [ ] **Step 2: Typecheck y lint**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificación manual**

Run: `npm run dev`, abrir `http://localhost:3000/dashboard`, seleccionar tipo de prueba "Login", escribir una credencial sin `@` (ej. `1098765432`) y enviar.
Expected: el navegador ya NO muestra el globo nativo "Incluye una @..."; el submit llega al servidor.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/_components/new-test-run-form.tsx
git commit -m "feat: permitir credencial no-email en el formulario de login"
```

---

## Task 3: Ampliar la detección de identificador en adaptive-login

**Files:**
- Modify: `lib/playwright/adaptive-login.ts`
- Test: `tests/lib/adaptive-login.test.ts` (crear)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/lib/adaptive-login.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isEmailFillSelector,
  isLoginSubmitSelector,
  isPasswordFillSelector,
  looksLikeEmail,
} from "@/lib/playwright/adaptive-login";

describe("isEmailFillSelector", () => {
  it("detecta type=email", () => {
    expect(isEmailFillSelector('input[type="email"]')).toBe(true);
  });

  it("detecta términos largos de identificador", () => {
    expect(isEmailFillSelector('input[name="usuario"]')).toBe(true);
    expect(isEmailFillSelector('input[placeholder="Número de documento"]')).toBe(true);
    expect(isEmailFillSelector('input[name="cedula"]')).toBe(true);
  });

  it("detecta tokens cortos solo con límite de palabra", () => {
    expect(isEmailFillSelector('input[name="cc"]')).toBe(true);
    expect(isEmailFillSelector('input[name="dni"]')).toBe(true);
    expect(isEmailFillSelector('input[id="rut"]')).toBe(true);
  });

  it("no produce falsos positivos por tokens cortos como substring", () => {
    expect(isEmailFillSelector('input[name="account"]')).toBe(false);
    expect(isEmailFillSelector('input[name="unit"]')).toBe(false);
    expect(isEmailFillSelector("#monitor")).toBe(false);
  });

  it("ignora selectores de password", () => {
    expect(isEmailFillSelector('input[type="password"]')).toBe(false);
  });
});

describe("isPasswordFillSelector", () => {
  it("detecta type=password y términos de clave", () => {
    expect(isPasswordFillSelector('input[type="password"]')).toBe(true);
    expect(isPasswordFillSelector('input[name="clave"]')).toBe(true);
  });

  it("no detecta un campo de usuario", () => {
    expect(isPasswordFillSelector('input[name="usuario"]')).toBe(false);
  });
});

describe("isLoginSubmitSelector", () => {
  it("detecta botones de submit y verbos de login", () => {
    expect(isLoginSubmitSelector('button[type="submit"]')).toBe(true);
    expect(isLoginSubmitSelector("text=Ingresar")).toBe(true);
  });

  it("no detecta un input de texto", () => {
    expect(isLoginSubmitSelector('input[name="usuario"]')).toBe(false);
  });
});

describe("looksLikeEmail", () => {
  it("acepta emails bien formados (recortando espacios)", () => {
    expect(looksLikeEmail("admin@test.com")).toBe(true);
    expect(looksLikeEmail("  admin@test.com  ")).toBe(true);
  });

  it("rechaza credenciales que no son email", () => {
    expect(looksLikeEmail("1098765432")).toBe(false);
    expect(looksLikeEmail("juan.perez")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/lib/adaptive-login.test.ts`
Expected: FAIL — `looksLikeEmail` no existe; los casos de tokens cortos (`cc`, `dni`, `rut`) fallan porque `isEmailFillSelector` aún usa `includes` crudo de `EMAIL_KEYWORDS`.

- [ ] **Step 3: Reemplazar las constantes de detección de email**

En `lib/playwright/adaptive-login.ts`, reemplazar el bloque `EMAIL_KEYWORDS` (líneas ~50-58) por:

```ts
// Términos largos: seguros como substring en name/id/placeholder.
const IDENTIFIER_LONG_TOKENS = [
  "email",
  "correo",
  "usuario",
  "username",
  "user",
  "mail",
  "login",
  "cedula",
  "documento",
  "identificacion",
];

// Términos cortos y ambiguos: solo con límite de palabra o atributo exacto.
const IDENTIFIER_SHORT_TOKENS = ["cc", "dni", "nit", "rut"];

const IDENTIFIER_SELECTOR_REGEX = new RegExp(
  `(${IDENTIFIER_LONG_TOKENS.join("|")}|\\b(?:${IDENTIFIER_SHORT_TOKENS.join("|")})\\b)`,
  "i",
);
```

`PASSWORD_KEYWORDS` (líneas ~60-67) se mantiene sin cambios.

- [ ] **Step 4: Ampliar `EMAIL_LABEL_REGEX`**

Reemplazar la línea ~69:

```ts
const EMAIL_LABEL_REGEX = /(email|correo|usuario|user(name)?|mail|login)/i;
```

por:

```ts
const EMAIL_LABEL_REGEX =
  /(email|correo|usuario|user(name)?|mail|login|c[eé]dula|documento|identificaci[oó]n|n[uú]mero de documento|\bcc\b|\bdni\b|\bnit\b|\brut\b)/i;
```

`PASSWORD_LABEL_REGEX` (línea ~70) se mantiene sin cambios.

- [ ] **Step 5: Reescribir `isEmailFillSelector`**

Reemplazar la función `isEmailFillSelector` (líneas ~96-102) por:

```ts
export function isEmailFillSelector(selector: string | null | undefined): boolean {
  if (!selector) return false;
  if (isPasswordFillSelector(selector)) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=email") || lower.includes('type="email"')) return true;
  return IDENTIFIER_SELECTOR_REGEX.test(lower);
}
```

- [ ] **Step 6: Ampliar los candidatos de `findEmailField`**

En `findEmailField`, dentro del array de candidatos, agregar las siguientes entradas justo después de `page.locator('input[id*="user" i]'),` (línea ~137):

```ts
      page.locator('input[name*="cedula" i]'),
      page.locator('input[name*="documento" i]'),
      page.locator('input[name*="identificacion" i]'),
      page.locator('input[id*="cedula" i]'),
      page.locator('input[id*="documento" i]'),
      page.locator('input[id*="identificacion" i]'),
      page.locator('input[name="cc" i]'),
      page.locator('input[name="dni" i]'),
      page.locator('input[name="nit" i]'),
      page.locator('input[name="rut" i]'),
      page.locator('input[id="cc" i]'),
      page.locator('input[id="dni" i]'),
      page.locator('input[id="nit" i]'),
      page.locator('input[id="rut" i]'),
```

El resto del array (`getByLabel`, `getByPlaceholder`, y el fallback `input:not([type="password"])...`) se mantiene sin cambios y al final.

- [ ] **Step 7: Agregar `looksLikeEmail`**

Justo después de la función `isEmailFillSelector`, agregar:

```ts
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/lib/adaptive-login.test.ts`
Expected: PASS — todos los casos pasan.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: sin errores. (Si `npm run typecheck` reporta `EMAIL_KEYWORDS` sin usar, confirmar que fue eliminado en el Step 3.)

- [ ] **Step 10: Commit**

```bash
git add lib/playwright/adaptive-login.ts tests/lib/adaptive-login.test.ts
git commit -m "feat: ampliar detección adaptativa a credenciales de documento"
```

---

## Task 4: Neutralizar y diagnosticar la validación HTML5 nativa

**Files:**
- Modify: `lib/playwright/adaptive-login.ts`

Estas funciones tocan el DOM vía Playwright; no se unit-testean sin navegador (se validan manualmente en la Task 6 del worker). No hay paso de test automatizado en esta tarea.

- [ ] **Step 1: Agregar `fillIdentifierField`**

En `lib/playwright/adaptive-login.ts`, después de `looksLikeEmail`, agregar:

```ts
export async function fillIdentifierField(
  page: Page,
  value: string,
  timeoutMs: number,
): Promise<{ relaxed: boolean }> {
  const field = await findEmailField(page);
  const relaxed = !looksLikeEmail(value);

  if (relaxed) {
    // El valor no parece email: si el campo es <input type="email">, el
    // navegador bloquearía el submit por validación de restricciones HTML5.
    // Desactivamos esa validación SOLO del lado del cliente.
    await field.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.type = "text";
      input.removeAttribute("pattern");
      const form = input.form;
      if (form) form.noValidate = true;
    });
  }

  await field.fill(value, { timeout: timeoutMs });
  return { relaxed };
}
```

- [ ] **Step 2: Agregar `detectNativeValidationBlock`**

Antes de `verifyLoginOutcome` (línea ~214), agregar esta función auxiliar privada (NO exportada):

```ts
async function detectNativeValidationBlock(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      if (form.noValidate) continue;
      if (form.checkValidity()) continue;
      for (const control of Array.from(form.elements)) {
        const candidate = control as HTMLInputElement;
        if (
          typeof candidate.checkValidity === "function" &&
          !candidate.checkValidity()
        ) {
          return (
            candidate.validationMessage ||
            "Validación nativa del navegador bloqueó el envío"
          );
        }
      }
    }
    return undefined;
  });
}
```

- [ ] **Step 3: Invocar el diagnóstico dentro de `verifyLoginOutcome`**

En `verifyLoginOutcome`, dentro del `while (Date.now() < deadline)`, justo después del bloque `if (currentUrl !== initialUrl) { ... }` y antes de `const errorText = await readVisibleErrorText(page);`, insertar:

```ts
    const nativeBlock = await detectNativeValidationBlock(page);
    if (nativeBlock) {
      return {
        success: false,
        finalUrl: page.url(),
        initialUrl,
        reason:
          `El navegador bloqueó el envío del formulario por validación nativa: ` +
          `"${nativeBlock}". Si esta app loguea por documento o usuario, ese ` +
          `campo está marcado como type=email por error.`,
        errorText: nativeBlock,
      };
    }
```

Nota: la condición `noValidate === false` dentro de `detectNativeValidationBlock` hace que esta rama quede muda cuando `fillIdentifierField` ya puso `noValidate = true`; actúa como red de seguridad para la ruta literal.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Re-correr los unit tests existentes**

Run: `npx vitest run tests/lib/adaptive-login.test.ts`
Expected: PASS — sin regresiones (las funciones puras no cambiaron).

- [ ] **Step 6: Commit**

```bash
git add lib/playwright/adaptive-login.ts
git commit -m "feat: relajar y diagnosticar la validación HTML5 nativa en login adaptativo"
```

---

## Task 5: Cablear `fillIdentifierField` en el runner

**Files:**
- Modify: `lib/playwright/execute-test-run.ts`

- [ ] **Step 1: Actualizar el import**

En `lib/playwright/execute-test-run.ts`, reemplazar el bloque de import desde `./adaptive-login` (líneas ~6-15):

```ts
import {
  findEmailField,
  findPasswordField,
  findSubmitButton,
  isEmailFillSelector,
  isLoginSubmitSelector,
  isPasswordFillSelector,
  verifyLoginOutcome,
  type LoginOutcome,
} from "./adaptive-login";
```

por:

```ts
import {
  fillIdentifierField,
  findPasswordField,
  findSubmitButton,
  isEmailFillSelector,
  isLoginSubmitSelector,
  isPasswordFillSelector,
  verifyLoginOutcome,
  type LoginOutcome,
} from "./adaptive-login";
```

(`findEmailField` ya no se usa directamente aquí — vive dentro de `fillIdentifierField`.)

- [ ] **Step 2: Reemplazar la vía `isEmailFillSelector` en la rama `fill`**

En `executeStep`, dentro de `case "fill":`, reemplazar:

```ts
        if (isEmailFillSelector(step.selector)) {
          const field = await findEmailField(page);
          await field.fill(step.value, { timeout: STEP_TIMEOUT_MS });
          return { selectorOverride: "[adaptive] email/usuario" };
        }
```

por:

```ts
        if (isEmailFillSelector(step.selector)) {
          const { relaxed } = await fillIdentifierField(
            page,
            step.value,
            STEP_TIMEOUT_MS,
          );
          return {
            selectorOverride: relaxed
              ? "[adaptive] identificador (validación nativa relajada)"
              : "[adaptive] email/usuario",
          };
        }
```

La vía `isPasswordFillSelector` (con `findPasswordField`) se mantiene sin cambios.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores. (Verifica que `findEmailField` ya no esté importado ni referenciado en este archivo.)

- [ ] **Step 4: Correr toda la suite de tests**

Run: `npm test`
Expected: PASS — todos los tests (`tests/api/test-runs.test.ts`, `tests/lib/validation/test-run.test.ts`, `tests/lib/adaptive-login.test.ts`) pasan.

- [ ] **Step 5: Commit**

```bash
git add lib/playwright/execute-test-run.ts
git commit -m "feat: usar fillIdentifierField en el runner para credenciales de login"
```

---

## Task 6: Actualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar el bullet de `findEmailField`**

En `CLAUDE.md`, sección "Detección adaptativa en flujos de login" → "### Helpers", reemplazar el bullet de `findEmailField`:

```
- `findEmailField(page)` — encuentra el campo de email/usuario probando en
  orden: `input[type=email]`, `autocomplete=email|username`, `name|id` que
  contengan `email|usuario|user|correo|login` (case-insensitive),
  `getByLabel`/`getByPlaceholder` con la misma regex, y como último recurso
  el primer `input` visible no-password.
```

por:

```
- `findEmailField(page)` — encuentra el campo de identificador (email,
  usuario o número de documento) probando en orden: `input[type=email]`,
  `autocomplete=email|username`, `name|id` con términos largos
  (`email|usuario|user|correo|login|cedula|documento|identificacion`,
  substring case-insensitive) o cortos (`cc|dni|nit|rut`, atributo exacto),
  `getByLabel`/`getByPlaceholder` con la regex de identificador (los tokens
  cortos solo con límite de palabra), y como último recurso el primer `input`
  visible no-password.
- `fillIdentifierField(page, value, timeout)` — localiza el campo con
  `findEmailField` y lo llena. Si el valor no parece email (`looksLikeEmail`
  es `false`) relaja antes la validación HTML5 del cliente: `type=text` y
  `removeAttribute("pattern")` en el input, `noValidate=true` en su `<form>`.
  Devuelve `{ relaxed }`.
```

- [ ] **Step 2: Actualizar el bullet de `verifyLoginOutcome`**

En el mismo bloque "### Helpers", reemplazar el bullet de `verifyLoginOutcome`:

```
- `verifyLoginOutcome(page, initialUrl)` — tras el submit hace polling de
  hasta 30s (cada 400ms) hasta detectar uno de tres signos: URL distinta a
  la inicial, campo de contraseña ya no visible, o un mensaje de error en una
  lista ampliada de selectores (`role=alert|status`, `aria-live`,
  `[class*=toast|snackbar|notification|error|alert]`, `.invalid-feedback`,
  `input[aria-invalid="true"]`, etc.). Si en 30s no hay ningún signo devuelve
  fallo con un mensaje diagnóstico (credenciales inválidas, selector exótico,
  o redirect lento).
```

por:

```
- `verifyLoginOutcome(page, initialUrl)` — tras el submit hace polling de
  hasta 30s (cada 400ms) hasta detectar uno de estos signos: URL distinta a
  la inicial, campo de contraseña ya no visible, un mensaje de error en una
  lista ampliada de selectores (`role=alert|status`, `aria-live`,
  `[class*=toast|snackbar|notification|error|alert]`, `.invalid-feedback`,
  `input[aria-invalid="true"]`, etc.), o un bloqueo de validación HTML5
  nativa. Para este último recorre los `<form>` con `noValidate=false` y
  `checkValidity()=false` y reporta el `validationMessage` del navegador
  (queda mudo en la vía adaptativa, donde ya se puso `noValidate=true`). Si
  en 30s no hay ningún signo devuelve fallo con un mensaje diagnóstico
  (credenciales inválidas, selector exótico, o redirect lento).
```

- [ ] **Step 3: Actualizar el bullet `fill` de "### Cómo se activa"**

Reemplazar:

```
- `fill`: si el selector huele a campo de password (`isPasswordFillSelector`),
  se descarta el selector hardcodeado y se usa `findPasswordField`. Lo mismo
  con `isEmailFillSelector` y `findEmailField`. Si no huele a ninguno se
  ejecuta literal.
```

por:

```
- `fill`: si el selector huele a campo de password (`isPasswordFillSelector`),
  se descarta el selector hardcodeado y se usa `findPasswordField`. Si huele a
  identificador (`isEmailFillSelector`, ahora una regex que cubre términos de
  documento como `cc`/`dni`/`cédula`) se usa `fillIdentifierField`, que además
  relaja la validación HTML5 nativa cuando el valor no parece un email. Si no
  huele a ninguno se ejecuta literal.
```

- [ ] **Step 4: Actualizar el bullet de "### Reporte en la UI"**

Reemplazar:

```
en la columna `selector` del `test_step` (`[adaptive] email/usuario`,
`[adaptive] password`, `[adaptive] submit`,
`[adaptive] verificado por comportamiento post-login`), y la URL real del
```

por:

```
en la columna `selector` del `test_step` (`[adaptive] email/usuario`,
`[adaptive] identificador (validación nativa relajada)`, `[adaptive] password`,
`[adaptive] submit`, `[adaptive] verificado por comportamiento post-login`), y
la URL real del
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documentar credenciales no-email en la detección adaptativa"
```

---

## Verificación final

- [ ] `npm test` — toda la suite pasa.
- [ ] `npm run typecheck` — sin errores.
- [ ] `npm run lint` — sin errores.
- [ ] **Manual (worker):** correr un test-run de login real contra (a) una app con campo `type=email` y credencial CC, y (b) una app de login por email normal. Verificar en `/dashboard/runs/[id]` que la columna `selector` muestra los labels `[adaptive]` correctos (`[adaptive] identificador (validación nativa relajada)` en el caso CC, `[adaptive] email/usuario` en el caso email).
