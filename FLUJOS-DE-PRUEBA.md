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
`[adaptive]` en la columna _selector_, y la URL/dato real queda en _value_.

## Sobre los tiempos

Un run tiene dos fases: **generación del plan** (llamada a Gemini
`gemini-2.5-flash`, típicamente 2–6 s) y **ejecución en Chromium** (cada paso
hace su acción + screenshot, ~0.5–2.5 s por paso). Los tiempos indicados abajo
son rangos típicos observados; el sitio real, su latencia y el número de pasos
hacen variar el total. Hay un límite duro de 90 s para generación y 120 s para
ejecución.

## Resumen de los 6 tipos

| Tipo       | Módulo                   | Demo de referencia          | Criterio de verificación por comportamiento                              |
| ---------- | ------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| Login      | `adaptive-login.ts`      | saucedemo.com               | URL cambió / desapareció el password / mensaje de error → fallo veraz    |
| Registro   | `adaptive-registro.ts`   | demo.realworld.io (Conduit) | URL cambió / mensaje de éxito / form desapareció; "email en uso" → fallo |
| Búsqueda   | `adaptive-search.ts`     | en.wikipedia.org            | señal fuerte de URL / DELTA de resultados nuevos / transición SPA        |
| Navegación | `adaptive-navegacion.ts` | the-internet.herokuapp.com  | página sana: cargó, con contenido, no es página de error                 |
| Formulario | `adaptive-formulario.ts` | httpbin.org/forms/post      | URL cambió / mensaje de éxito / form desapareció                         |
| E-commerce | `adaptive-ecommerce.ts`  | demoblaze.com               | **solo** si se detecta la confirmación de la orden                       |

Todos comparten helpers en `adaptive-common.ts` y marcan sus pasos con
`[adaptive]`. Cada uno tiene tests puros + de integración (Chromium real contra
fixtures locales), incluyendo su **trampa de falso positivo**.

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
  además hay poco contenido, para no marcar una home que solo _menciona_ la
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
- **Qué pasa:** el usuario elige _Navegación_, pega la URL y lanza el run. El
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
- **Qué pasa:** el usuario elige _Formulario_, pega la URL y lista los campos. El
  sistema resuelve cada campo por su etiqueta, lo llena, hace click en
  "Submit order" y verifica que la página de eco del POST se cargó.
- **Tiempo típico:** ~10–25 s (generación ~2–6 s + un paso por campo + submit).
- **Respuesta esperada:** run **completado** en verde; el paso de envío aparece
  como `[adaptive] formulario enviado y verificado` y la URL real (`/post`, con
  el eco JSON de los datos) queda en _value_. Si algún campo no existiera o el
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
- **Qué pasa:** el usuario elige _Registro_, pega la URL y sus datos. El sistema
  llena nombre, email y contraseña (omite "confirmar" si no existe), envía y
  verifica que la cuenta quedó creada (redirección al feed).
- **Tiempo típico:** ~12–30 s (generación ~3–6 s + llenado de campos + submit +
  ventana de verificación).
- **Respuesta esperada:** run **completado** en verde con los pasos
  `[adaptive] nombre` / `[adaptive] email/usuario` / `[adaptive] password` /
  `[adaptive] submit registro` y la URL real post-registro en _value_. Si el
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

---

## E-commerce (compra completa)

### Cómo funciona técnicamente

- Módulo: `worker/lib/adaptive-ecommerce.ts` — una **macro multi-etapa** con un
  checkpoint de comportamiento en cada paso:
  1. `addToCartStage` — localiza y pulsa "agregar al carrito" (tolera idioma) y
     acepta el diálogo nativo "producto agregado" si aparece.
  2. `goToCheckoutStage` — navega al carrito y avanza al checkout.
  3. `fillPaymentStage` — llena los datos de pago (mapea `card`→tarjeta,
     `expiry`→campo único o `splitExpiry` a mes/año, `cvc`→cvc/cvv, `email`),
     resolviendo los campos por `name`, `id`, `label`, `placeholder` y
     `autocomplete` (best-effort; los campos ausentes se omiten).
  4. `confirmOrderAndVerify` — pulsa confirmar/pagar.
- **El criterio de éxito es estricto:** el run solo sale verde si se **detecta la
  confirmación de la orden** (mensaje tipo "thank you for your purchase",
  "compra exitosa", "order placed", SweetAlert de confirmación). No hay ningún
  camino de éxito más débil. Trampa de falso positivo cubierta por test: una
  tienda cuyo "confirmar" no produce confirmación devuelve `success: false`.
- **Detección por intención** (los selectores se solapan), evaluada en orden
  confirmar-orden → agregar-al-carrito → ir-a-checkout para resolver siempre
  hacia la intención más fuerte.

### Honestidad de QA — límites conocidos

E-commerce es el tipo **menos generalizable**: cada tienda es distinta.

- **Pagos en iframe** (Stripe Elements, PayPal): quedan **fuera de alcance**; los
  campos dentro de un iframe de terceros no son accesibles inline. La macro lo
  reporta con un diagnóstico claro.
- **Modelo de datos:** los datos de e-commerce son `email`, `card`, `expiry`,
  `cvc`. Si el checkout de una tienda exige campos que no están en ese modelo
  (p. ej. demoblaze pide un campo **"Name"** del comprador, y otras piden
  dirección o requieren login), la confirmación final puede no completarse — no
  por el motor, sino por el dato faltante. El motor conduce el flujo
  correctamente y **falla con veracidad** si no hay confirmación.

### Experiencia de usuario

- **URL de referencia:** `https://www.demoblaze.com/` — tienda demo SPA con
  carrito y checkout de **tarjeta inline** (no iframe), el caso que la macro
  cubre. (Confirmado en vivo que la tienda y su flujo carrito→checkout cargan.)
- **Datos:** email del comprador, número de tarjeta, vencimiento (MM/AA), CVC.
- **Qué pasa:** el usuario elige _E-commerce_, pega la URL. El sistema agrega un
  producto al carrito, va a checkout, llena los datos de pago detectados y pulsa
  comprar; verifica la confirmación de la orden.
- **Tiempo típico:** ~20–45 s (generación ~3–6 s + varias etapas de navegación y
  llenado + verificación de confirmación).
- **Respuesta esperada:** con una tienda de tarjeta inline cuyos campos
  requeridos estén dentro del modelo de datos, run **completado** en verde con
  los pasos `[adaptive] agregar al carrito` / `[adaptive] ir a checkout` /
  `[adaptive] datos de pago` / `[adaptive] confirmar orden` y la confirmación en
  _value_. Si la tienda exige un dato fuera del modelo o usa pago en iframe, el
  run sale **fallido** con el diagnóstico — nunca un falso verde.

---

## Login (inicio de sesión)

### Cómo funciona técnicamente

- Módulo: `worker/lib/adaptive-login.ts` (`findEmailField`, `findPasswordField`,
  `findSubmitButton`, `verifyLoginOutcome`, `fillIdentifierField`).
- Detecta el campo de identificador tolerando que la credencial **no** sea email
  (usuario, cédula, documento: `cc`/`dni`/`nit`/`rut`…). Si el valor no parece
  email y el campo es `type=email`, **relaja la validación HTML5 nativa** del
  cliente antes de llenar (sin eso, el navegador bloquearía el envío).
- Verificación por comportamiento (`verifyLoginOutcome`, polling hasta 30 s):
  éxito si cambió la URL o desapareció el campo de contraseña; **fallo** si
  aparece un mensaje de error (lista amplia de selectores de alerta/toast) o un
  bloqueo de validación nativa. Tras un login exitoso abre una ventana de
  verificación para los `expect_*` siguientes.

### Experiencia de usuario

- **URL de ejemplo:** `https://www.saucedemo.com/` (usuario `standard_user`,
  contraseña `secret_sauce`).
- **Datos:** identificador (email/usuario/documento) y contraseña.
- **Qué pasa:** el usuario elige _Login_, pega la URL y las credenciales. El
  sistema localiza los campos, los llena, envía y verifica que entró.
- **Tiempo típico:** ~10–25 s (generación ~2–6 s + llenado + verificación).
- **Respuesta esperada:** run **completado** en verde con
  `[adaptive] email/usuario` / `[adaptive] password` / `[adaptive] submit` y la
  URL real post-login en _value_. Con credenciales inválidas, run **fallido** con
  el mensaje de error real de la app (no un timeout genérico).

---

## Búsqueda

### Cómo funciona técnicamente

- Módulo: `worker/lib/adaptive-search.ts` (`findSearchField`, `findSearchSubmit`,
  `executeSearch`, `urlSignalsSearch`, `looksLikeEmptyState`).
- Localiza el buscador (`type=search`, `name=q`/`s`, `role=searchbox`,
  placeholder…), toma un **baseline** de candidatos a resultado, envía (botón o
  Enter) y verifica con una señal **fuerte**: la URL trae un parámetro de
  búsqueda conocido / refleja el query / es ruta de resultados, **o** aparecen
  nodos de resultado **nuevos** (DELTA) respecto al baseline, **o** hay una
  transición de SPA.
- **Por qué DELTA y no presencia:** muchos sitios ya tienen nodos
  `item`/`product` en nav/footer antes de buscar; exigir nodos _nuevos_ evita el
  falso positivo de "casi cualquier búsqueda pasa verde". `resultsFound`
  distingue además los resultados reales del estado de cero resultados.

### Experiencia de usuario

- **URL de ejemplo:** `https://en.wikipedia.org/wiki/Main_Page` (buscador con el
  query reflejado en la página de resultados).
- **Datos:** término de búsqueda y, opcionalmente, un resultado esperado.
- **Qué pasa:** el usuario elige _Búsqueda_, pega la URL y el término. El sistema
  escribe en el buscador, envía y verifica que realmente aparecieron resultados.
- **Tiempo típico:** ~10–25 s (generación ~2–6 s + envío + polling de
  resultados, hasta ~10 s).
- **Respuesta esperada:** run **completado** en verde con
  `[adaptive] campo de búsqueda` / `[adaptive] submit búsqueda (con resultados)`
  y la URL real de resultados en _value_. Si la búsqueda no produce ninguna
  señal (envío que no dispara, o cero resultados sin confirmar), el run sale
  **fallido** con el diagnóstico.
