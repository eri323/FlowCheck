# Diseño — Blindaje SSRF (defensa en profundidad)

- **Fecha:** 2026-05-24
- **Estado:** Aprobado para planificación
- **Área:** `worker/lib/safe-url.ts`, `worker/lib/execute-test-run.ts`, `worker/test/*`, `lib/validation/test-run.ts`, `render.yaml`, `CLAUDE.md`

## Contexto

El usuario pega una URL y describe un flujo; el worker abre un navegador real
(Chromium) que **navega a esa URL**, ejecuta pasos y **sube screenshots** a
Supabase Storage. La protección actual contra SSRF valida **solo el esquema**
(`http`/`https`) en dos puntos:

- **API (Zod):** `httpUrlSchema` en `lib/validation/test-run.ts:3` valida
  `target_url`.
- **Worker:** `assertSafeNavigationUrl` en `worker/lib/safe-url.ts` valida el
  `value` de cada paso `goto` (`execute-test-run.ts:236`).

El contexto del navegador se crea en `execute-test-run.ts:501`
(`browser.newContext(...)`).

## Problema

Validar solo el esquema deja un SSRF real ahora que la herramienta está
pública. Cualquier usuario **registrado** (hay auth + RLS + rate limit 5/min,
pero eso no basta) puede hacer que el navegador del worker navegue a destinos
internos y exfiltrar el contenido vía screenshot:

- Loopback / interno: `http://localhost`, `http://127.0.0.1`, `http://10.0.0.5`,
  `http://192.168.x.x` → servicios internos del contenedor o de la red.
- Metadata cloud: `http://169.254.169.254/latest/meta-data/` → credenciales.

Y los bypasses que una blocklist literal **no** cubre:

1. **Hostname público que resuelve a IP interna** (p. ej. un dominio del
   atacante con un registro A apuntando a `127.0.0.1`).
2. **IPs codificadas**: decimal (`http://2130706433`), IPv6 (`[::1]`),
   IPv4-mapped (`::ffff:127.0.0.1`).
3. **Redirect a interno**: una URL pública que responde `302` hacia una URL
   interna.
4. **DNS rebinding**: el navegador re-resuelve el nombre después de que pasó
   nuestro chequeo (TOCTOU); el primer lookup devuelve una IP pública y el
   segundo, una interna.

Una blocklist literal sola es bypasseable y un revisor de seguridad la marcaría
como insuficiente.

## Objetivos

- Bloquear navegación e **cualquier request** del navegador hacia IPs privadas,
  loopback, link-local (incl. metadata) y rangos especiales.
- Cubrir los cuatro bypasses de arriba (hostname→IP-interna, encodings,
  redirects, rebinding) y también sub-recursos (imágenes, fetch, etc.).
- No romper la suite de tests existente, que navega a `127.0.0.1` con fixtures
  HTTP efímeras.
- Sin dependencias nuevas en runtime (`node:net`, `node:dns/promises`).

## No-objetivos (YAGNI)

- No se implementa un proxy HTTP forward dedicado; la intercepción por request
  de Playwright es suficiente.
- La capa Zod **no** resuelve DNS (no es razonable en el path de request de
  Vercel); queda como filtro literal de UX. La enforcement real vive en el
  worker.
- No se cubren protocolos fuera de `http`/`https` más allá de seguir
  rechazándolos por esquema.

## Modelo en capas

| Capa                           | Dónde                             | Chequeo                                                       | Rol                                                      |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| API (Zod)                      | `lib/validation/test-run.ts`      | síncrono, blocklist **literal** de host                       | `400` rápido: un `target_url` malo ni arranca el run     |
| Worker pre-nav                 | `worker/lib/safe-url.ts`          | async, guard que **resuelve DNS** sobre el `value` del `goto` | mensaje de error limpio por paso                         |
| Worker interceptor de requests | contexto en `execute-test-run.ts` | async, guard con DNS en **cada request**                      | **la frontera real**: redirects, rebinding, sub-recursos |

Es defensa en profundidad intencional, no redundancia: la capa Zod da feedback
rápido; el worker es la enforcement real.

## Diseño detallado

### 1. Núcleo puro de clasificación de host (`worker/lib/safe-url.ts`)

Funciones puras, sin I/O, fáciles de unit-testear:

- `isBlockedIp(ip: string): boolean` — recibe una IP literal (v4 o v6) ya
  normalizada y decide si está en un rango prohibido:
  - **IPv4**: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10` (CGNAT),
    `127.0.0.0/8` (loopback), `169.254.0.0/16` (link-local, incluye
    `169.254.169.254` metadata), `172.16.0.0/12`, `192.0.0.0/24`,
    `192.168.0.0/16`, `224.0.0.0/4` (multicast), `240.0.0.0/4` (reservado),
    `255.255.255.255` (broadcast).
  - **IPv6**: `::1` (loopback), `::` (unspecified), `fc00::/7` (ULA),
    `fe80::/10` (link-local), `ff00::/8` (multicast); IPv4-mapped
    `::ffff:a.b.c.d` se desempaqueta y se clasifica como IPv4.
- `isBlockedLiteralHost(hostname: string): boolean` — versión **síncrona** para
  Zod: `true` si el hostname es `localhost` (o `*.localhost`), una IP literal
  bloqueada (`net.isIP` + `isBlockedIp`), o un encoding obvio de IP (decimal /
  octal / hex que parsee a una IP bloqueada). No hace DNS.

### 2. Guard de URL async (`assertSafeUrl`)

Reemplaza a `assertSafeNavigationUrl`, que tiene un único caller
(`execute-test-run.ts:236`): se renombra a `assertSafeUrl` (ahora `async`) y se
actualiza ese caller. No se mantiene alias del nombre viejo.

```
assertSafeUrl(value: string): Promise<void>
```

Pasos:

1. Parsear con `new URL(value)`; si falla → error "URL inválida".
2. Validar esquema `http`/`https` (igual que hoy).
3. Si `SSRF_ALLOW_PRIVATE_NETWORK` está activo → return (escape hatch).
4. Extraer `hostname` (quitar corchetes de IPv6).
5. Si `net.isIP(hostname) > 0` → clasificar con `isBlockedIp`; si bloqueado →
   throw con razón concreta.
6. Si no es IP literal → `dns.lookup(hostname, { all: true })`; si **cualquier**
   dirección resuelta pasa `isBlockedIp` → throw. Resolver por DNS derrota el
   caso `nombre-público→IP-interna` y las IPs codificadas (`getaddrinfo` parsea
   `2130706433` a una IP que después clasificamos).

El mensaje de error debe ser legible y no filtrar detalle innecesario, p. ej.
`URL bloqueada por política de red interna`.

### 3. Interceptor de requests (la frontera real)

En `execute-test-run.ts`, justo después de `browser.newContext()` (línea ~501),
y solo cuando el guard está activo (sin `SSRF_ALLOW_PRIVATE_NETWORK`):

```ts
await context.route("**/*", async (route) => {
  try {
    await assertSafeUrl(route.request().url());
    await route.continue();
  } catch {
    await route.abort("blockedbyclient");
  }
});
```

Se evalúa **por request**, así que:

- Cubre el `goto` inicial, **redirects** (cada hop es un request nuevo),
  **rebinding** (la resolución DNS ocurre acá, en tiempo de fetch) y
  **sub-recursos**.
- El paso `goto` conserva una llamada `assertSafeUrl` pre-navegación para dar un
  error legible al usuario; el interceptor es la garantía aunque el pre-check se
  saltara.

### 4. Escape hatch (`SSRF_ALLOW_PRIVATE_NETWORK`)

- Variable de entorno. **Sin setear** (prod en Render, declarado/omitido en
  `render.yaml`) → guard activo.
- El setup de los `*.integration.test.ts` adaptativos la **setea** para que sus
  fixtures en `127.0.0.1` sigan funcionando.
- Un helper central lee el flag (p. ej. `isPrivateNetworkAllowed()`) para que
  tanto `assertSafeUrl` como el registro del interceptor compartan la misma
  decisión.

### 5. Capa Zod (`lib/validation/test-run.ts`)

`httpUrlSchema` añade un `.refine` que, además del esquema, rechaza
`isBlockedLiteralHost(hostname)` con mensaje claro (p. ej. "La URL apunta a una
dirección interna no permitida"). Solo literal; sin DNS.

> Nota: `isBlockedLiteralHost`/`isBlockedIp` viven en el worker. Para que la
> capa Zod (app Next.js) las use sin acoplar el front al worker, el plan
> decidirá si se extrae un módulo compartido pequeño o se duplica la lógica
> literal mínima en `lib/`. Preferencia: módulo compartido sin dependencias.

## Testing

- **Unit (el grueso)** — `worker/test/safe-url.test.ts`:
  - `isBlockedIp`: una aserción por rango v4 y v6 de arriba, IPs públicas que
    deben pasar (`8.8.8.8`, `1.1.1.1`), IPv4-mapped, broadcast, unspecified.
  - `isBlockedLiteralHost`: `localhost`, IPs literales bloqueadas, encoding
    decimal, y hosts públicos normales que pasan.
- **Integración** — `worker/test/safe-url.integration.test.ts` (Chromium real,
  guard **forzado a ON** ignorando el escape hatch para este archivo):
  - Navegar a un fixture local `127.0.0.1` → **bloqueado**.
  - Fixture que responde `302` hacia `127.0.0.1` → **bloqueado** (prueba que el
    interceptor atrapa el redirect, no solo el primer hop).
- La suite existente sigue verde porque sus integration tests setean
  `SSRF_ALLOW_PRIVATE_NETWORK`.

## Riesgos y mitigaciones

- **Romper tests existentes**: mitigado con el escape hatch en el setup de los
  integration tests actuales.
- **Latencia por `dns.lookup`**: un lookup por host (cacheado por el SO); coste
  despreciable frente a un job de 30–60s.
- **Falsos positivos en sitios legítimos detrás de CDN**: las CDNs resuelven a
  IPs públicas, no se ven afectadas. CGNAT (`100.64/10`) se bloquea por
  precaución; aceptable para el caso de uso.

## Documentación

Actualizar `CLAUDE.md` (sección de seguridad / reglas "Lo que NO se debe hacer")
para describir el guard SSRF, el modelo en capas y el flag
`SSRF_ALLOW_PRIVATE_NETWORK`.
