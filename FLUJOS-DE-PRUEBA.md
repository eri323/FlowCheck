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
