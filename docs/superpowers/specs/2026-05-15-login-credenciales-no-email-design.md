# Diseño — Login con credenciales que no son email (CC / usuario)

- **Fecha:** 2026-05-15
- **Estado:** Aprobado para planificación
- **Área:** `lib/playwright/adaptive-login.ts`, `lib/playwright/execute-test-run.ts`

## Contexto

Cuando `test_type === "login"`, el worker no ejecuta literalmente los selectores
que sugiere Gemini para las credenciales: usa la heurística adaptativa de
`lib/playwright/adaptive-login.ts` (`findEmailField`, `findPasswordField`,
`findSubmitButton`, `verifyLoginOutcome`). Esto tolera variaciones de idioma y
maquetado entre apps y juzga el login por comportamiento, no por aserciones
literales.

## Problema

Al probar una app cuya credencial no es un email (un CC / número de documento o
un username), el flujo se rompe:

1. La app bajo prueba tiene su campo de credencial como `<input type="email">`.
2. `findEmailField()` encuentra y llena el campo correctamente con `.fill()`.
3. Al hacer `findSubmitButton().click()`, el navegador corre la validación de
   restricciones HTML5, ve que el valor no contiene `@`, **bloquea el envío del
   formulario** y muestra el globo nativo _"Incluye una @ en la dirección de
   correo electrónico"_.
4. El formulario nunca se envía: la URL no cambia y el campo de contraseña sigue
   visible. `verifyLoginOutcome` agota 30 s y devuelve un fallo con un mensaje
   genérico y confuso que no nombra la causa real.

Problema secundario: las keywords de detección (`EMAIL_KEYWORDS`,
`EMAIL_LABEL_REGEX`) no cubren términos de documento (`cc`, `cédula`,
`documento`, `dni`, `nit`, `rut`). Un campo `name="cc"` o con label "Documento"
solo se encuentra por el último fallback ("primer input visible no-password"), y
`isEmailFillSelector` ni siquiera enruta esos selectores a la vía adaptativa.

## Objetivos

- Permitir testear flujos de login cuya credencial no es un email (CC, número de
  documento, username).
- Reconocer campos identificadores etiquetados o nombrados con términos de
  documento, sin introducir falsos positivos.
- Cuando la falla sea genuina (la app realmente exige email), reportar un
  diagnóstico claro en lugar del mensaje genérico de timeout.

## Fuera de alcance

- El login de la propia plataforma (Supabase Auth sigue identificando por email).
- UI nueva para elegir "tipo de credencial" en el formulario de test-run.
- Captchas, MFA, OAuth y otros flujos de autenticación no básicos.

## Diseño

### 1. Detección ampliada del campo identificador

En `adaptive-login.ts`:

- Ampliar el universo de términos identificadores. Términos **largos y seguros**
  como substring: `email`, `correo`, `usuario`, `username`, `user`, `mail`,
  `login`, `cedula`, `documento`, `identificacion`. Términos **cortos y
  ambiguos**: `cc`, `dni`, `nit`, `rut`.
- Los tokens cortos solo se matchean con **límites de palabra** (`\b`) en las
  regex de label/placeholder y con **selectores de atributo exactos**
  (`input[name="cc" i]`, `input[id="cc" i]`), nunca con substring crudo — así no
  matchea "a**cc**ount", "u**nit**", "mo**nit**or".
- `EMAIL_LABEL_REGEX` se amplía a algo equivalente a:
  `/(email|correo|usuario|user(name)?|mail|login|c[eé]dula|documento|identificaci[oó]n|n[uú]mero de documento|\bcc\b|\bdni\b|\bnit\b|\brut\b)/i`
- `findEmailField` añade candidatos por `name`/`id`: substring para los términos
  largos (`*="cedula" i`, `*="documento" i`, `*="identificacion" i`) y atributo
  exacto para los cortos (`[name="cc" i]`, `[name="dni" i]`, `[name="nit" i]`,
  `[name="rut" i]`, y sus equivalentes con `id`). El fallback final ("primer
  input visible no-password") se conserva.
- `isEmailFillSelector` deja de hacer `includes` crudo de keywords y pasa a
  probar el selector contra una única regex (con `\b` para los tokens cortos).
  Así un selector de Gemini como `input[name="cc"]` o
  `input[placeholder="Número de documento"]` enruta a la detección adaptativa en
  vez de ejecutarse literal. `isPasswordFillSelector` se mantiene igual.

### 2. Neutralizar la validación nativa al llenar

Dos nuevas funciones exportadas en `adaptive-login.ts`:

```ts
export function looksLikeEmail(value: string): boolean;
export async function fillIdentifierField(
  page: Page,
  value: string,
  timeoutMs: number,
): Promise<{ relaxed: boolean }>;
```

- `looksLikeEmail`: comprobación conservadora de forma de email
  (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` sobre el valor recortado).
- `fillIdentifierField`: localiza el campo con `findEmailField`. Si
  `looksLikeEmail(value)` es `false`, **relaja las restricciones nativas antes**
  del `.fill()`:
  - en el `<input>`: `type = "text"` y `removeAttribute("pattern")`;
  - en su `<form>` (si existe): `noValidate = true`.
    Devuelve `{ relaxed: true }`. Si el valor sí parece email, no toca nada y
    devuelve `{ relaxed: false }`. Si el input no está dentro de un `<form>` (SPA
    con submit por JS), la validación nativa de submit no aplica y solo se llena.

En `execute-test-run.ts`, rama `fill`: la vía `isEmailFillSelector` reemplaza el
bloque actual (`findEmailField` + `.fill()`) por `fillIdentifierField`. El
`selectorOverride` del paso pasa a:

- `[adaptive] email/usuario` cuando `relaxed === false`;
- `[adaptive] identificador (validación nativa relajada)` cuando
  `relaxed === true`.

**Por qué es seguro:** `noValidate` y `type=text` solo desactivan validación del
**cliente**. La petición llega igual al servidor; si la app realmente exige un
email, el servidor rechaza la credencial y `verifyLoginOutcome` detecta el
mensaje de error o que el campo de contraseña sigue visible → el test falla
correctamente. No se introducen falsos positivos: la verificación por
comportamiento sigue siendo el árbitro real.

### 3. Diagnóstico de validación nativa

En `adaptive-login.ts`, una función auxiliar que inspecciona el DOM tras el
submit:

```ts
// Recorre los <form> de la página. Para cada form con noValidate === false
// y checkValidity() === false, devuelve el validationMessage del primer
// input inválido (mensaje localizado del navegador). Si no hay bloqueo,
// devuelve undefined.
async function detectNativeValidationBlock(
  page: Page,
): Promise<string | undefined>;
```

`verifyLoginOutcome` la invoca dentro de su loop de polling. Si devuelve un
mensaje, retorna fallo inmediato con un `reason` claro, por ejemplo:

> "El navegador bloqueó el envío del formulario por validación nativa:
> 'Incluye una @ en la dirección de correo electrónico'. Si esta app loguea por
> documento o usuario, ese campo está marcado como `type=email` por error."

La condición `noValidate === false` es clave: en la vía adaptativa ya pusimos
`noValidate = true`, así que esta rama queda **muda** en ese caso y nunca
reporta como bloqueo algo que decidimos bypassear deliberadamente. Actúa como
red de seguridad para la ruta literal (cuando `isEmailFillSelector` no enrutó) y
para campos inválidos distintos al identificador.

## Archivos afectados

| Archivo                              | Cambio                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/playwright/adaptive-login.ts`   | Keywords/regex ampliadas; `looksLikeEmail`, `fillIdentifierField`, `detectNativeValidationBlock`; `isEmailFillSelector` reescrita con regex; `verifyLoginOutcome` invoca el diagnóstico. |
| `lib/playwright/execute-test-run.ts` | Rama `fill` → vía `isEmailFillSelector` usa `fillIdentifierField` y ajusta el `selectorOverride` según `relaxed`.                                                                        |
| `tests/lib/adaptive-login.test.ts`   | Nuevo. Unit tests de las funciones puras.                                                                                                                                                |
| `CLAUDE.md`                          | Actualizar la sección "Detección adaptativa en flujos de login".                                                                                                                         |

## Plan de pruebas

- **Unit (Vitest), nuevo `tests/lib/adaptive-login.test.ts`:** funciones puras
  `isEmailFillSelector`, `isPasswordFillSelector`, `isLoginSubmitSelector` y
  `looksLikeEmail`. Casos: términos nuevos (`cc`, `dni`, `nit`, `rut`, `cedula`,
  `documento`) detectados; no-falsos-positivos (`account`, `unit`, `monitor`);
  valores email vs CC/usuario en `looksLikeEmail`.
- **Manual:** las funciones que tocan el DOM (`findEmailField`,
  `fillIdentifierField`, `verifyLoginOutcome`, `detectNativeValidationBlock`) no
  se unit-testean sin navegador. Se validan corriendo un test-run de login real
  contra (a) una app con campo `type=email` + credencial CC y (b) una app de
  login por email normal, verificando que el reporte muestre los labels
  `[adaptive]` correctos.

## Riesgos y mitigaciones

- **Falso positivo en detección por tokens cortos** → mitigado con `\b` y
  selectores de atributo exactos; cubierto por unit tests de no-regresión.
- **Bypassear validación de cliente oculta un problema real de la app** →
  mitigado porque `verifyLoginOutcome` sigue juzgando por comportamiento; si el
  servidor exige email, el test falla igual con el error real.
- **Apps SPA que validan con su propio JS** (`checkValidity()` en su handler) →
  poner `type=text` en el input neutraliza también el `typeMismatch` que ese JS
  consultaría; el resto de validación JS de la app queda fuera de alcance.
