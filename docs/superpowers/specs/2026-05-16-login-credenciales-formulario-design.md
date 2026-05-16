# Diseño — Login con credenciales no-email: formulario y validación

- **Fecha:** 2026-05-16
- **Estado:** Aprobado para planificación
- **Área:** `lib/validation/test-run.ts`, `app/dashboard/_components/new-test-run-form.tsx`
- **Companion aprobado:** `2026-05-15-login-credenciales-no-email-design.md` (lado worker)

## Contexto

El usuario quiere probar flujos de login de apps cuya credencial **no es un
email** (cédula / CC / número de documento o un username).

El spec del 2026-05-15 resolvió la detección adaptativa en el worker
(`lib/playwright/adaptive-login.ts`), pero marcó explícitamente como fuera de
alcance cualquier cambio en el formulario de test-run. Eso dejó una
contradicción: el spec del worker asume que el valor (CC / usuario) llega al
worker, pero el formulario de la plataforma nunca lo deja salir.

## Problema

El formulario "Generar y ejecutar test", tipo **Login**, obliga a que la
credencial sea un email en dos capas:

1. **Cliente** — `new-test-run-form.tsx`: el campo es
   `<input type="email" required>`. El navegador corre su validación de
   restricciones HTML5, ve que el valor no contiene `@`, bloquea el envío del
   formulario y muestra el globo nativo *"Incluye una @ en la dirección de
   correo electrónico"*.
2. **Servidor** — `lib/validation/test-run.ts`, `loginDataSchema`:
   `email: z.email("Email inválido").max(320)`. Aunque el cliente se saltara,
   Zod rechaza el valor con `400`.

Resultado: es imposible enviar un test-run de login con credencial CC / usuario.

## Objetivos

- Permitir crear un test-run de login con una credencial que no es email
  (email, username o número de documento), tanto en el cliente como en el
  servidor.
- No degradar la validación de los flujos que **sí** requieren email real
  (`registro`, `ecommerce`).

## Fuera de alcance

- El login de la propia plataforma (Supabase Auth sigue identificando por
  email).
- UI nueva para elegir un "tipo de credencial" en el formulario: no se añade un
  selector; simplemente se relaja el único campo de credencial existente.
- La detección adaptativa del lado del worker — cubierta por el spec companion
  del 2026-05-15, que se implementa en el mismo plan.
- Renombrar la clave `email` en `test_data`. Se evaluó y se descartó: el valor
  nunca fue un email "de verdad" a nivel de motor (siempre se usa literal en un
  `.fill()`); renombrar tocaría 5 archivos sin cambiar comportamiento.

## Diseño

### 1. Validación del servidor

En `lib/validation/test-run.ts`, un schema dedicado para la credencial de
login que reemplaza a `z.email()` **solo en `loginDataSchema`**:

```ts
const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, "La credencial es obligatoria")
  .max(320, "La credencial es demasiado larga")
  .refine((v) => !/[\r\n\t]/.test(v), "La credencial no puede tener saltos de línea");

const loginDataSchema = z.object({
  email: loginIdentifierSchema,
  password: passwordSchema,
});
```

- La clave del objeto sigue siendo `email`: no cambia el contrato de
  `test_data`, ni `buildGeneratorInput` en el worker, ni `GenerateTestPlanInput`
  (`email: string` sigue siendo cierto).
- `registroDataSchema.email` y `ecommerceDataSchema.email` **se mantienen como
  `z.email()`** — esos flujos sí necesitan un email real.
- El refinamiento "sin saltos de línea ni tabs" protege `buildUserMessage`
  (`lib/gemini/generate-test-plan.ts`), que arma el prompt de Gemini línea por
  línea: una credencial con `\n` rompería esa estructura.
- El límite `max(320)` se conserva (cubre emails largos; CC / usernames son más
  cortos).

### 2. Campo del formulario

En `app/dashboard/_components/new-test-run-form.tsx`, sección
`testType === "login"`:

- `type="email"` → `type="text"`. Esto elimina la validación nativa HTML5 que
  bloquea el submit del formulario de la plataforma.
- Label `"Email"` → `"Email o usuario"`.
- Placeholder → `"admin@test.com, usuario o CC"`.
- Se mantienen `required` y la clave de estado `login.email` (`LoginState`
  no cambia).

No se tocan las secciones `registro` ni `ecommerce`: sus campos de email siguen
siendo `type="email"`.

**Por qué es seguro:** la credencial es un *valor*, no un selector — llega a un
`.fill()` de Playwright, donde texto arbitrario es inofensivo. La validación
existe por UX (campo obligatorio, sin basura), no por seguridad. La regla de
CLAUDE.md sobre validar selectores con Zod no aplica a este valor.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `lib/validation/test-run.ts` | `loginIdentifierSchema` nuevo; `loginDataSchema.email` lo usa. `registro` / `ecommerce` sin cambios. |
| `app/dashboard/_components/new-test-run-form.tsx` | Campo de login: `type=text`, label y placeholder. |
| `tests/api/test-runs.test.ts` | Caso nuevo: login con credencial no-email pasa validación; login con email sigue pasando. |

## Plan de pruebas

- **Unit / API (Vitest), `tests/api/test-runs.test.ts`:**
  - Un test-run `login` con credencial no-email (ej. `"1098765432"`) pasa la
    validación de `createTestRunSchema` y llega a la DB (antes daba `400`).
  - Un test-run `login` con un email normal sigue pasando.
  - Un test-run `registro` con credencial no-email sigue siendo rechazado con
    "Email inválido" (no-regresión: `z.email()` intacto ahí).
- **Manual:** abrir el formulario, tipo Login, escribir una credencial sin `@`
  y confirmar que el navegador ya no muestra el globo nativo y que el submit
  llega al servidor.

## Riesgos y mitigaciones

- **Relajar la validación deja pasar credenciales basura** → mitigado: el
  schema sigue exigiendo string no vacío, sin saltos de línea, con tope de
  longitud. El arbitraje real del login lo hace `verifyLoginOutcome` en el
  worker (juzga por comportamiento).
- **Confusión entre este cambio y el login de la propia plataforma** →
  explícitamente fuera de alcance; `loginDataSchema` es el del *formulario de
  test-run*, no el de `app/login/actions.ts`.
