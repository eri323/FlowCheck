import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
