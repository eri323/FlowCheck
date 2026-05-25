# Blindaje SSRF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear que el navegador del worker (y la validación de la API) naveguen o hagan cualquier request hacia IPs privadas, loopback, link-local (incl. metadata cloud) y rangos especiales, cubriendo hostname→IP-interna, IPs codificadas, redirects y DNS rebinding.

**Architecture:** Defensa en profundidad en tres capas: (1) capa Zod en la app Next.js — filtro **literal** síncrono para feedback `400` rápido; (2) worker pre-navegación — guard async que **resuelve DNS** antes de cada `goto`; (3) worker interceptor — `context.route("**/*")` que valida **cada request** (la frontera real: cubre redirects, rebinding, sub-recursos). Un núcleo puro de clasificación de IP/host se duplica entre worker y app porque Render despliega el worker con `rootDir: worker` y no puede importar fuera de `worker/`.

**Tech Stack:** TypeScript strict, `node:dns/promises` (resolución DNS, solo worker), Playwright (`playwright-core`), Vitest. El clasificador de IP/host es puro (regex/parsing, sin node builtins) para ser seguro en el bundle del cliente. Sin dependencias nuevas.

---

## File Structure

- `worker/lib/safe-url.ts` — **modificar** (hoy solo exporta `assertSafeNavigationUrl`). Pasa a contener: núcleo puro (`ipv4ToInt`, `isBlockedIp`, `isBlockedLiteralHost` + helpers), `isPrivateNetworkAllowed`, `assertSafeUrl` (async, con DNS) e `installSsrfGuard`. Se elimina `assertSafeNavigationUrl`.
- `worker/lib/execute-test-run.ts` — **modificar** (línea 10 import; línea 236 `goto`; línea ~501 creación de contexto).
- `worker/test/safe-url.test.ts` — **crear** (unit puros + `assertSafeUrl`).
- `worker/test/safe-url.integration.test.ts` — **crear** (Chromium real + interceptor).
- `lib/validation/safe-host.ts` — **crear** (copia del núcleo puro: `isBlockedLiteralHost` + helpers, sin DNS ni Playwright).
- `lib/validation/test-run.ts` — **modificar** (`httpUrlSchema` añade rechazo de host interno literal).
- `tests/lib/validation/test-run.test.ts` — **modificar** (casos SSRF literales).
- `render.yaml` — **modificar** (comentario documentando que el flag NO se define en prod).
- `CLAUDE.md` — **modificar** (documentar el guard SSRF en la sección de seguridad).

---

### Task 1: Núcleo puro de clasificación IP/host (worker)

**Files:**

- Modify: `worker/lib/safe-url.ts`
- Test: `worker/test/safe-url.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Crear `worker/test/safe-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isBlockedIp, isBlockedLiteralHost } from "../lib/safe-url";

describe("isBlockedIp — IPv4", () => {
  it("bloquea loopback, privadas, link-local/metadata y especiales", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.5",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.168.1.10",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("permite IPs públicas", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.63.255.255"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe("isBlockedIp — IPv6", () => {
  it("bloquea loopback, unspecified, ULA, link-local, multicast y IPv4-mapped interna", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("permite IPv6 público y IPv4-mapped público", () => {
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isBlockedLiteralHost", () => {
  it("bloquea localhost, IPs literales internas y encodings de IPv4", () => {
    for (const host of [
      "localhost",
      "foo.localhost",
      "127.0.0.1",
      "169.254.169.254",
      "[::1]",
      "2130706433", // decimal de 127.0.0.1
      "0x7f000001", // hex de 127.0.0.1
    ]) {
      expect(isBlockedLiteralHost(host), host).toBe(true);
    }
  });

  it("permite hostnames públicos normales", () => {
    for (const host of ["example.com", "sub.example.com", "8.8.8.8"]) {
      expect(isBlockedLiteralHost(host), host).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Desde `worker/`: `npx vitest run test/safe-url.test.ts`
Expected: FAIL — `isBlockedIp`/`isBlockedLiteralHost` no existen (no exportadas por `safe-url.ts`).

- [ ] **Step 3: Write minimal implementation**

Reemplazar **todo** el contenido de `worker/lib/safe-url.ts` por el núcleo puro (las funciones async se añaden en Task 2 y 3; por ahora dejar también el `assertSafeNavigationUrl` viejo intacto al final para no romper el import de `execute-test-run.ts` todavía):

```ts
// --- IPv4 ---

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = (acc << 8) | n;
  }
  return acc >>> 0;
}

function inV4Range(ip: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (baseInt & mask) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedIpv4(ip: number): boolean {
  return BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits));
}

// --- IPv6 ---

function ipv6Groups(ip: string): number[] | null {
  let s = ip.split("%")[0]!; // descarta zone id
  if (s.includes(".")) {
    const idx = s.lastIndexOf(":");
    if (idx === -1) return null;
    const v4 = ipv4ToInt(s.slice(idx + 1));
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    s = s.slice(0, idx + 1) + hi + ":" + lo;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function isBlockedIpv6(g: number[]): boolean {
  if (g.every((x) => x === 0)) return true; // ::
  if (
    g[0] === 0 &&
    g[1] === 0 &&
    g[2] === 0 &&
    g[3] === 0 &&
    g[4] === 0 &&
    g[5] === 0 &&
    g[6] === 0 &&
    g[7] === 1
  ) {
    return true; // ::1
  }
  if (
    g[0] === 0 &&
    g[1] === 0 &&
    g[2] === 0 &&
    g[3] === 0 &&
    g[4] === 0 &&
    g[5] === 0xffff
  ) {
    return isBlockedIpv4(((g[6]! << 16) | g[7]!) >>> 0); // ::ffff:a.b.c.d
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0]! & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

// --- Clasificadores públicos ---

// Detecta el tipo de IP literal SIN node:net (la app importa esto en el bundle
// del cliente, donde node:net no existe).
function ipKind(s: string): 0 | 4 | 6 {
  if (ipv4ToInt(s) !== null) return 4;
  if (s.includes(":") && ipv6Groups(s) !== null) return 6;
  return 0;
}

export function isBlockedIp(ip: string): boolean {
  const kind = ipKind(ip);
  if (kind === 4) return isBlockedIpv4(ipv4ToInt(ip)!);
  if (kind === 6) {
    const g = ipv6Groups(ip);
    return g ? isBlockedIpv6(g) : true;
  }
  return false; // no es IP literal: el caller decide vía DNS
}

function parseLooseIpv4(host: string): number | null {
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  if (/^0x[0-9a-fA-F]+$/.test(host)) {
    const n = parseInt(host, 16);
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  return null;
}

export function isBlockedLiteralHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (ipKind(host) !== 0) return isBlockedIp(host);
  const loose = parseLooseIpv4(host);
  if (loose !== null) return isBlockedIpv4(loose);
  return false;
}

// --- Compatibilidad temporal (se elimina en Task 3) ---

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function assertSafeNavigationUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`URL inválida para navegación: "${value}"`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Esquema de URL no permitido (${parsed.protocol}). Solo http o https.`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Desde `worker/`: `npx vitest run test/safe-url.test.ts`
Expected: PASS (todos los casos verdes).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/safe-url.ts worker/test/safe-url.test.ts
git commit -m "feat(worker): núcleo puro de clasificación SSRF (IPv4/IPv6 + literal host)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Guard async con resolución DNS (`assertSafeUrl`)

**Files:**

- Modify: `worker/lib/safe-url.ts`
- Test: `worker/test/safe-url.test.ts`

- [ ] **Step 1: Write the failing test**

Añadir al final de `worker/test/safe-url.test.ts`:

```ts
import { afterEach, beforeEach } from "vitest";
import { assertSafeUrl, isPrivateNetworkAllowed } from "../lib/safe-url";

describe("assertSafeUrl", () => {
  const original = process.env.SSRF_ALLOW_PRIVATE_NETWORK;
  beforeEach(() => {
    delete process.env.SSRF_ALLOW_PRIVATE_NETWORK;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SSRF_ALLOW_PRIVATE_NETWORK;
    else process.env.SSRF_ALLOW_PRIVATE_NETWORK = original;
  });

  it("rechaza esquemas no http/https", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rechaza IPs literales internas", async () => {
    await expect(assertSafeUrl("http://127.0.0.1")).rejects.toThrow();
    await expect(
      assertSafeUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toThrow();
    await expect(assertSafeUrl("http://[::1]:3000")).rejects.toThrow();
  });

  it("rechaza hostnames que resuelven a interno (localhost → loopback)", async () => {
    await expect(assertSafeUrl("http://localhost:3000")).rejects.toThrow();
  });

  it("respeta el escape hatch SSRF_ALLOW_PRIVATE_NETWORK", async () => {
    process.env.SSRF_ALLOW_PRIVATE_NETWORK = "1";
    expect(isPrivateNetworkAllowed()).toBe(true);
    await expect(assertSafeUrl("http://127.0.0.1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Desde `worker/`: `npx vitest run test/safe-url.test.ts`
Expected: FAIL — `assertSafeUrl` e `isPrivateNetworkAllowed` no existen.

- [ ] **Step 3: Write minimal implementation**

En `worker/lib/safe-url.ts`: añadir el import de dns como primera línea del archivo:

```ts
import { promises as dns } from "node:dns";
```

Y reemplazar el bloque "Compatibilidad temporal" (la función `assertSafeNavigationUrl` y su `ALLOWED_PROTOCOLS`) por:

```ts
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function isPrivateNetworkAllowed(): boolean {
  return process.env.SSRF_ALLOW_PRIVATE_NETWORK === "1";
}

export async function assertSafeUrl(value: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`URL inválida para navegación: "${value}"`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Esquema de URL no permitido (${parsed.protocol}). Solo http o https.`,
    );
  }
  if (isPrivateNetworkAllowed()) return;

  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (ipKind(host) !== 0) {
    if (isBlockedIp(host)) {
      throw new Error("URL bloqueada por política de red interna.");
    }
    return;
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`No se pudo resolver el host: "${host}".`);
  }
  if (addrs.some((a) => isBlockedIp(a.address))) {
    throw new Error("URL bloqueada por política de red interna.");
  }
}
```

> Nota: `assertSafeNavigationUrl` queda eliminada aquí. `execute-test-run.ts` aún la importa; se arregla en Task 3. El typecheck del worker fallará hasta entonces — es esperado dentro de esta tarea; los tests de `safe-url` sí pasan.

- [ ] **Step 4: Run test to verify it passes**

Desde `worker/`: `npx vitest run test/safe-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/safe-url.ts worker/test/safe-url.test.ts
git commit -m "feat(worker): assertSafeUrl async con resolución DNS y escape hatch

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Interceptor de requests + cableado en el executor

**Files:**

- Modify: `worker/lib/safe-url.ts` (añadir `installSsrfGuard`)
- Modify: `worker/lib/execute-test-run.ts:10` (import), `:236` (`goto`), `:501` (contexto)
- Test: `worker/test/safe-url.integration.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Crear `worker/test/safe-url.integration.test.ts`:

```ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { installSsrfGuard } from "../lib/safe-url";

let secretHits = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname === "/secret") {
    secretHits += 1;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>x</title><body>TOP SECRET INTERNAL</body>");
    return;
  }
  if (url.pathname === "/redirect") {
    res.statusCode = 302;
    res.setHeader("location", "/secret");
    res.end();
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end("<!doctype html><title>ok</title><body>ok</body>");
});

let browser: Browser;
let base: string;
let context: BrowserContext;
const original = process.env.SSRF_ALLOW_PRIVATE_NETWORK;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  secretHits = 0;
  delete process.env.SSRF_ALLOW_PRIVATE_NETWORK;
});
afterEach(async () => {
  await context?.close();
  if (original === undefined) delete process.env.SSRF_ALLOW_PRIVATE_NETWORK;
  else process.env.SSRF_ALLOW_PRIVATE_NETWORK = original;
});

describe("installSsrfGuard (browser)", () => {
  it("bloquea la navegación directa a un host interno", async () => {
    context = await browser.newContext();
    await installSsrfGuard(context);
    const page = await context.newPage();
    await expect(page.goto(`${base}/secret`)).rejects.toThrow();
    expect(secretHits).toBe(0);
  }, 20_000);

  it("bloquea un redirect 302 hacia un host interno (el destino nunca se sirve)", async () => {
    context = await browser.newContext();
    await installSsrfGuard(context);
    const page = await context.newPage();
    await expect(page.goto(`${base}/redirect`)).rejects.toThrow();
    expect(secretHits).toBe(0);
  }, 20_000);

  it("con el escape hatch activo permite navegar a interno (y el redirect sí resuelve)", async () => {
    process.env.SSRF_ALLOW_PRIVATE_NETWORK = "1";
    context = await browser.newContext();
    await installSsrfGuard(context);
    const page = await context.newPage();
    await page.goto(`${base}/redirect`);
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("/secret");
    expect(secretHits).toBeGreaterThanOrEqual(1);
  }, 20_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Desde `worker/`: `npx vitest run test/safe-url.integration.test.ts`
Expected: FAIL — `installSsrfGuard` no existe.

- [ ] **Step 3: Write minimal implementation**

En `worker/lib/safe-url.ts` añadir el import de tipo de Playwright (junto a los otros imports, arriba):

```ts
import type { BrowserContext } from "playwright-core";
```

Y añadir al final del archivo:

```ts
export async function installSsrfGuard(context: BrowserContext): Promise<void> {
  if (isPrivateNetworkAllowed()) return;
  await context.route("**/*", async (route) => {
    try {
      await assertSafeUrl(route.request().url());
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}
```

Ahora cablear en `worker/lib/execute-test-run.ts`:

Línea 10 — cambiar el import:

```ts
import { assertSafeUrl, installSsrfGuard } from "./safe-url";
```

Líneas 235-236 (acción `goto`) — usar el guard async:

```ts
if (!step.value) throw new Error("La acción 'goto' requiere un value (URL)");
await assertSafeUrl(step.value);
```

Líneas ~501-502 (creación de contexto) — instalar el interceptor antes de abrir la página:

```ts
const context = await browser.newContext(contextOptions);
await installSsrfGuard(context);
const page = await context.newPage();
```

- [ ] **Step 4: Run test to verify it passes**

Desde `worker/`: `npx vitest run test/safe-url.integration.test.ts`
Expected: PASS (3 casos verdes).

Verificar también que el typecheck del worker vuelve a estar limpio (Task 2 lo había dejado roto a propósito):
Desde `worker/`: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/safe-url.ts worker/lib/execute-test-run.ts worker/test/safe-url.integration.test.ts
git commit -m "feat(worker): interceptor SSRF por request en el contexto del navegador

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Capa Zod en la app (filtro literal de UX)

**Files:**

- Create: `lib/validation/safe-host.ts`
- Modify: `lib/validation/test-run.ts:3-18` (`httpUrlSchema`)
- Test: `tests/lib/validation/test-run.test.ts`

- [ ] **Step 1: Write the failing test**

Añadir al final de `tests/lib/validation/test-run.test.ts`:

```ts
describe("createTestRunSchema — SSRF (host interno literal)", () => {
  const cases = [
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]:8080",
    "http://2130706433", // decimal de 127.0.0.1
    "http://10.0.0.5",
    "http://192.168.1.1",
  ];
  for (const target_url of cases) {
    it(`rechaza target_url interno: ${target_url}`, () => {
      const result = createTestRunSchema.safeParse({
        target_url,
        test_type: "navegacion",
        test_data: {},
      });
      expect(result.success).toBe(false);
    });
  }

  it("sigue aceptando una URL pública normal", () => {
    const result = createTestRunSchema.safeParse({
      target_url: "https://example.com",
      test_type: "navegacion",
      test_data: {},
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Desde la raíz: `npx vitest run tests/lib/validation/test-run.test.ts`
Expected: FAIL — las URLs internas hoy pasan la validación (solo se valida esquema).

- [ ] **Step 3: Write minimal implementation**

Crear `lib/validation/safe-host.ts` (copia del núcleo puro del worker, sin DNS,
sin Playwright y **sin node builtins**). Esto último es obligatorio: el
componente cliente `app/dashboard/runs/new/_components/new-test-run-form.tsx`
(`"use client"`) importa de `@/lib/validation/test-run`, que ahora importará
`safe-host.ts`; si `safe-host.ts` importara `node:net`, el bundle del navegador
rompería. Por eso la detección de IP es pura (regex/parsing), vía `ipKind`:

```ts
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = (acc << 8) | n;
  }
  return acc >>> 0;
}

function inV4Range(ip: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (baseInt & mask) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedIpv4(ip: number): boolean {
  return BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits));
}

function ipv6Groups(ip: string): number[] | null {
  let s = ip.split("%")[0]!;
  if (s.includes(".")) {
    const idx = s.lastIndexOf(":");
    if (idx === -1) return null;
    const v4 = ipv4ToInt(s.slice(idx + 1));
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    s = s.slice(0, idx + 1) + hi + ":" + lo;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function isBlockedIpv6(g: number[]): boolean {
  if (g.every((x) => x === 0)) return true;
  if (
    g[0] === 0 &&
    g[1] === 0 &&
    g[2] === 0 &&
    g[3] === 0 &&
    g[4] === 0 &&
    g[5] === 0 &&
    g[6] === 0 &&
    g[7] === 1
  ) {
    return true;
  }
  if (
    g[0] === 0 &&
    g[1] === 0 &&
    g[2] === 0 &&
    g[3] === 0 &&
    g[4] === 0 &&
    g[5] === 0xffff
  ) {
    return isBlockedIpv4(((g[6]! << 16) | g[7]!) >>> 0);
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return true;
  if ((g[0]! & 0xffc0) === 0xfe80) return true;
  if ((g[0]! & 0xff00) === 0xff00) return true;
  return false;
}

function ipKind(s: string): 0 | 4 | 6 {
  if (ipv4ToInt(s) !== null) return 4;
  if (s.includes(":") && ipv6Groups(s) !== null) return 6;
  return 0;
}

export function isBlockedIp(ip: string): boolean {
  const kind = ipKind(ip);
  if (kind === 4) return isBlockedIpv4(ipv4ToInt(ip)!);
  if (kind === 6) {
    const g = ipv6Groups(ip);
    return g ? isBlockedIpv6(g) : true;
  }
  return false;
}

function parseLooseIpv4(host: string): number | null {
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  if (/^0x[0-9a-fA-F]+$/.test(host)) {
    const n = parseInt(host, 16);
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  return null;
}

export function isBlockedLiteralHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (ipKind(host) !== 0) return isBlockedIp(host);
  const loose = parseLooseIpv4(host);
  if (loose !== null) return isBlockedIpv4(loose);
  return false;
}
```

> Esta duplicación es intencional: Render despliega el worker con `rootDir: worker`, así que el worker no puede importar `lib/`. Ambas copias tienen tests para detectar drift. La copia de la app es solo-literal (sin DNS) y sin node builtins (segura para el bundle del cliente); el worker es la enforcement real.

Modificar `lib/validation/test-run.ts` — añadir el import al inicio y ampliar el `.refine` de `httpUrlSchema`:

```ts
import { z } from "zod";
import { isBlockedLiteralHost } from "./safe-host";

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "La URL es obligatoria")
  .max(2048, "La URL es demasiado larga")
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
        return !isBlockedLiteralHost(url.hostname);
      } catch {
        return false;
      }
    },
    {
      message:
        "La URL debe usar http/https y no apuntar a una dirección interna",
    },
  );
```

- [ ] **Step 4: Run test to verify it passes**

Desde la raíz: `npx vitest run tests/lib/validation/test-run.test.ts`
Expected: PASS (casos SSRF rechazados, URL pública aceptada, y los tests previos del archivo siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/safe-host.ts lib/validation/test-run.ts tests/lib/validation/test-run.test.ts
git commit -m "feat(api): rechazar target_url hacia hosts internos en la validación Zod

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Documentación (CLAUDE.md + render.yaml)

**Files:**

- Modify: `render.yaml`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar el flag en render.yaml**

En `render.yaml`, dentro de `envVars`, añadir un comentario (NO una variable) justo después de la línea `envVars:` para dejar explícito que el guard va activo en prod:

```yaml
envVars:
  # SSRF_ALLOW_PRIVATE_NETWORK se deja SIN definir a propósito: el guard SSRF
  # del worker (lib/safe-url.ts) debe estar activo en producción. Solo se
  # activa ("1") en entornos de test/dev que navegan a 127.0.0.1.
  - key: SUPABASE_URL
    sync: false
```

- [ ] **Step 2: Documentar el guard en CLAUDE.md**

En `CLAUDE.md`, en la sección `## Lo que NO se debe hacer — Reglas de seguridad`, bajo `### Validación de inputs del usuario`, añadir al final de esa subsección:

```markdown
- **Protección SSRF (defensa en profundidad).** Validar el esquema no basta: el
  worker navega con un navegador real y sube screenshots, así que un destino
  interno permitiría exfiltrar contenido. La protección vive en tres capas:
  1. **API (Zod)** — `lib/validation/test-run.ts` rechaza `target_url` cuyo host
     sea interno por forma literal (`localhost`, IPs privadas/loopback/link-local
     y encodings) vía `isBlockedLiteralHost` (`lib/validation/safe-host.ts`).
     Filtro síncrono de UX; no resuelve DNS.
  2. **Worker pre-navegación** — `assertSafeUrl` (`worker/lib/safe-url.ts`)
     resuelve DNS y bloquea si el host resuelve a una IP interna, antes de cada
     `goto`.
  3. **Worker interceptor** — `installSsrfGuard` registra `context.route("**/*")`
     y valida **cada request** (la frontera real: cubre redirects, DNS rebinding
     y sub-recursos). Aplicado al crear el contexto en `execute-test-run.ts`.
     El núcleo de clasificación de IP/host está **duplicado** en
     `worker/lib/safe-url.ts` y `lib/validation/safe-host.ts` porque Render
     despliega el worker con `rootDir: worker` (no puede importar fuera de
     `worker/`); ambas copias tienen tests. El flag `SSRF_ALLOW_PRIVATE_NETWORK=1`
     desactiva el guard y **solo** debe usarse en test/dev (los integration tests lo
     setean para navegar a `127.0.0.1`); en Render se deja sin definir.
```

- [ ] **Step 3: Commit**

```bash
git add render.yaml CLAUDE.md
git commit -m "docs: documentar guard SSRF y flag SSRF_ALLOW_PRIVATE_NETWORK

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Verificación final completa

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Suite completa del worker**

Desde `worker/`: `npm test`
Expected: PASS — incluidos `safe-url.test.ts`, `safe-url.integration.test.ts` y todos los `adaptive-*` (estos no instalan el guard, así que su navegación a `127.0.0.1` sigue funcionando).

- [ ] **Step 2: Typecheck del worker**

Desde `worker/`: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Suite completa de la app + typecheck + lint**

Desde la raíz:

- `npm test` → PASS (incluye `tests/lib/validation/test-run.test.ts`).
- `npm run typecheck` → sin errores.
- `npm run lint` → sin errores nuevos.

- [ ] **Step 4: Build de la app (prueba definitiva del bundle del cliente)**

Desde la raíz: `npm run build`
Expected: build OK. Esto confirma que `safe-host.ts` (importado transitivamente
por el form cliente vía `test-run.ts`) no arrastró ningún `node:` builtin al
bundle del navegador. Si el build se queja de un módulo `node:*` no resoluble en
el cliente, revisar que `safe-host.ts` no importe builtins.

- [ ] **Step 5: Verificación manual del contrato (sanity)**

Confirmar por grep que no quedó ninguna referencia a `assertSafeNavigationUrl`:
Buscar `assertSafeNavigationUrl` en `worker/` (excluyendo `docs/`).
Expected: 0 resultados en código (solo aparece en specs/plans históricos).

- [ ] **Step 6: Commit final (si quedó algo suelto)**

Si todo estaba ya commiteado, no hace falta. Si hubo ajustes de lint/typecheck:

```bash
git add -A
git commit -m "chore: ajustes finales de verificación del blindaje SSRF

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
