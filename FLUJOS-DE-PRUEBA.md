# Flujos de prueba — Cómo funciona cada tipo

Esta plataforma recibe una **URL** y, según el **tipo de prueba** elegido, genera
un plan con Gemini y lo ejecuta en un Chromium headless, paso a paso, con
screenshots y reporte en vivo.

Este documento explica, por cada tipo de prueba: **(a)** cómo funciona
técnicamente y **(b)** la experiencia del usuario — qué URL pega, qué datos
introduce, cuánto tarda y qué respuesta obtiene.

## La regla de oro: verificación por comportamiento

Para los flujos frágiles, el worker **no** ejecuta literalmente los selectores
que adivina la IA. Usa **heurística adaptativa** (tolerante a idioma y maquetado)
y, sobre todo, **juzga el resultado por comportamiento real**, no por la mera
presencia de un elemento. Esto evita los dos problemas clásicos:

- **Falsos negativos**: el test rompe porque el selector adivinado no coincide
  con la app real (otro idioma, otra estructura).
- **Falsos positivos** (lo más peligroso): el test sale "verde" sin que el flujo
  real haya ocurrido.

Cada tipo adaptativo trae además un test de **"trampa de falso positivo"** que
prueba justamente que NO da verde cuando el flujo no sucede.

Los pasos resueltos por heurística aparecen en el reporte con el prefijo
`[adaptive]` en la columna *selector*, y la URL/dato real queda en *value*.

## Sobre los tiempos

Un run tiene dos fases: **generación del plan** (llamada a Gemini
`gemini-2.5-flash`, típicamente 2–6 s) y **ejecución en Chromium** (cada paso
hace su acción + screenshot, ~0.5–2.5 s por paso). Los tiempos indicados abajo
son rangos típicos observados; el sitio real, su latencia y el número de pasos
hacen variar el total. Hay un límite duro de 90 s para generación y 120 s para
ejecución.

---

## Navegación (smoke test)

### Cómo funciona técnicamente

- Módulo: `worker/lib/adaptive-navegacion.ts` (`verifyPageHealthy`,
  `clickAdaptive`, `looksLikeErrorPage`).
- Es un **smoke / health test**: confirma que la app **carga y renderiza**.
  Como `test_data` está vacío, cualquier aserción de contenido que sugiera la IA
  sería una suposición suya, no una expectativa del usuario; por eso la
  verificación honesta es por **salud de página**.
- `verifyPageHealthy` declara la página sana si: cargó (`domcontentloaded`),
  tiene `<title>`, renderizó contenido de texto suficiente y **no** parece un
  documento de error (`looksLikeErrorPage` detecta 404/500/"not found"… cuando
  además hay poco contenido, para no marcar una home que solo *menciona* la
  palabra "error").
- Los clicks usan `clickAdaptive`: intenta el selector literal y, si falla, cae a
  buscar el enlace/botón por su **nombre accesible** (`getByRole`) y luego por
  texto — nunca por el atributo `name` (eso podría clickear el elemento
  equivocado).
- Verificación por comportamiento: si la página no está sana, el paso **falla**
  con el diagnóstico (p. ej. "la página parece un documento de error").

### Experiencia de usuario

- **URL de ejemplo:** `https://the-internet.herokuapp.com/`
- **Datos:** ninguno (solo la URL; opcionalmente una instrucción libre de
  navegación, p. ej. "entra a Form Authentication").
- **Qué pasa:** el usuario elige *Navegación*, pega la URL y lanza el run. El
  sistema genera un plan corto (goto + verificación de salud), abre Chromium,
  carga la página, sigue la instrucción si la hay y verifica que todo renderizó.
- **Tiempo típico:** ~8–20 s (generación ~2–5 s + ejecución de pocos pasos).
- **Respuesta esperada:** run **completado** en verde, con screenshot del home
  cargado y los pasos de verificación marcados
  `[adaptive] navegación verificada por salud de página`. Si la URL fuera una
  página de error o no renderizara, el run saldría **fallido** con la razón.

---

## Formulario (llenado genérico)

### Cómo funciona técnicamente

- Módulo: `worker/lib/adaptive-formulario.ts` (`parseFields`, `resolveField`,
  `fillField`, `fillAndSubmitForm`).
- El usuario describe los campos como líneas `etiqueta: valor`. `parseFields` los
  parsea (corta en el primer `:` o `=`).
- Para cada par, `resolveField` localiza el control tolerando idioma/maquetado:
  prueba `getByLabel`, `getByPlaceholder`, `[aria-label*=…]`, y `name`/`id` por
  substring. **Escapa los metacaracteres de regex** del label, así una etiqueta
  como "Teléfono (móvil)" no rompe la búsqueda.
- `fillField` llena según el tipo de control: texto/textarea (`fill`), `select`
  (`selectOption` por etiqueta o valor), checkbox/radio (`check`/`uncheck` según
  `asBoolean` del valor: sí/no/true/false/x…).
- El submit dispara `fillAndSubmitForm`: hace un **barrido de completitud**
  (rellena cualquier campo aún vacío), envía con `findGenericSubmit` y
  **verifica por comportamiento**: la URL cambió, apareció un mensaje de éxito o
  el formulario desapareció. Falla si tras enviar hay un error visible o un
  bloqueo de validación nativa, o si no hay ninguna señal.
- Trampa de falso positivo cubierta por test: un `<form>` con `preventDefault`
  que no hace nada al enviar devuelve `success: false` (no da verde).

### Experiencia de usuario

- **URL de ejemplo:** `https://httpbin.org/forms/post`
- **Datos (campos):**
  ```
  Customer name: Ana Pérez
  Telephone: 5551234
  E-mail address: ana@ejemplo.com
  Preferred delivery time: 18:00
  Delivery instructions: Tocar el timbre
  ```
- **Qué pasa:** el usuario elige *Formulario*, pega la URL y lista los campos. El
  sistema resuelve cada campo por su etiqueta, lo llena, hace click en
  "Submit order" y verifica que la página de eco del POST se cargó.
- **Tiempo típico:** ~10–25 s (generación ~2–6 s + un paso por campo + submit).
- **Respuesta esperada:** run **completado** en verde; el paso de envío aparece
  como `[adaptive] formulario enviado y verificado` y la URL real (`/post`, con
  el eco JSON de los datos) queda en *value*. Si algún campo no existiera o el
  envío no produjera ninguna señal, el run saldría **fallido** con el
  diagnóstico.

---

## Registro (alta de cuenta)

### Cómo funciona técnicamente

- Módulo: `worker/lib/adaptive-registro.ts` (`findNameField`,
  `findConfirmPasswordField`, `registerAndVerify`); reutiliza los detectores de
  email/contraseña de login (`findEmailField`, `findPasswordField`,
  `looksLikeEmail`).
- Detección por paso (espeja login), en este **orden** —el orden importa porque
  un selector con "password" también matchea el de confirmación—: confirmar
  contraseña → contraseña → nombre → email/usuario.
- `registerAndVerify` llena los campos presentes y **omite con gracia** los
  ausentes (p. ej. apps sin "confirmar contraseña"). Si el valor del
  identificador no parece email, relaja la validación HTML5 nativa antes de
  llenar (igual que login).
- Verificación por comportamiento tras el submit: cambió la URL, apareció un
  mensaje de éxito, o desapareció el formulario → éxito; un error visible de
  tipo "el email ya está en uso" → **fallo real** (no falso verde). Luego abre
  una ventana de verificación post-registro para los `expect_*` siguientes.
- Trampa de falso positivo cubierta por test: registro con email duplicado
  devuelve `success: false` con la razón, aunque el formulario siga en pantalla.

### Experiencia de usuario

- **URL de ejemplo:** `https://demo.realworld.io/#/register` (Conduit) — un
  registro de formulario único con Usuario + Email + Contraseña, el calce ideal
  para la heurística.
- **Datos:** nombre/usuario, email (conviene uno único por corrida), contraseña
  (y confirmación si la app la pide).
- **Qué pasa:** el usuario elige *Registro*, pega la URL y sus datos. El sistema
  llena nombre, email y contraseña (omite "confirmar" si no existe), envía y
  verifica que la cuenta quedó creada (redirección al feed).
- **Tiempo típico:** ~12–30 s (generación ~3–6 s + llenado de campos + submit +
  ventana de verificación).
- **Respuesta esperada:** run **completado** en verde con los pasos
  `[adaptive] nombre` / `[adaptive] email/usuario` / `[adaptive] password` /
  `[adaptive] submit registro` y la URL real post-registro en *value*. Si el
  email ya estuviera registrado, el run saldría **fallido** indicando el motivo.

> **Nota de verificación:** durante esta verificación, el instance público de
> Conduit respondió `403` al navegador headless (las demos públicas a veces
> limitan tráfico automatizado). La heurística de registro está validada por los
> tests de integración con Chromium real contra fixtures locales
> (`worker/test/adaptive-registro.integration.test.ts`), que reproducen el flujo
> exacto incluyendo la trampa de email duplicado. Otra demo de registro de
> formulario único, confirmada en vivo, es
> `https://practice.expandtesting.com/register` (Usuario + Contraseña +
> Confirmar Contraseña; sin campo email).
