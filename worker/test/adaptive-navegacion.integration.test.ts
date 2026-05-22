// worker/test/adaptive-navegacion.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { clickAdaptive, verifyPageHealthy } from "../lib/adaptive-navegacion";

function html(body: string, title = "Demo"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/home":
      res.end(html(`<main><h1>Inicio</h1><p>${"Contenido real ".repeat(40)}</p>
        <a href="/about">Acerca de</a></main>`, "Mi Sitio"));
      return;
    case "/about":
      res.end(html(`<h1>Acerca de</h1><p>${"Info ".repeat(40)}</p>`, "Acerca de"));
      return;
    case "/name-trap":
      // El name "Acerca de" no existe en ningún elemento, pero su valor
      // coincide como substring con el texto visible del enlace "Acerca de".
      // Tras eliminar el fallback por name, NO debe hacer click en ese enlace.
      res.end(html(`<main><h1>Trampa</h1><p>${"Contenido real ".repeat(40)}</p>
        <a href="/about">Acerca de</a></main>`, "Trampa"));
      return;
    case "/missing":
      res.statusCode = 404;
      res.end(html(`404 Not Found`, "404"));
      return;
    default:
      res.statusCode = 404;
      res.end(html("not found", "404"));
  }
});

let browser: Browser;
let base: string;
let activePage: Page;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(async () => {
  activePage = await browser.newPage();
});
afterEach(async () => {
  await activePage?.close();
});

describe("verifyPageHealthy (browser)", () => {
  it("una home con contenido es sana", async () => {
    await activePage.goto(`${base}/home`);
    const health = await verifyPageHealthy(activePage);
    expect(health.healthy).toBe(true);
    expect(health.title).toBe("Mi Sitio");
  }, 20_000);

  it("una página 404 con poco contenido NO es sana (sin falso positivo)", async () => {
    await activePage.goto(`${base}/missing`);
    const health = await verifyPageHealthy(activePage);
    expect(health.healthy).toBe(false);
  }, 20_000);
});

describe("clickAdaptive (browser)", () => {
  it("usa el selector literal cuando funciona", async () => {
    await activePage.goto(`${base}/home`);
    await clickAdaptive(activePage, 'a[href="/about"]', 5_000);
    await activePage.waitForLoadState("domcontentloaded");
    expect(activePage.url()).toContain("/about");
  }, 20_000);

  it("cae al texto cuando el selector literal no existe", async () => {
    await activePage.goto(`${base}/home`);
    // selector inválido para esta página, pero el texto 'Acerca de' existe
    await clickAdaptive(activePage, 'text=Acerca de', 5_000);
    await activePage.waitForLoadState("domcontentloaded");
    expect(activePage.url()).toContain("/about");
  }, 20_000);

  it("NO deriva un click del valor de name= (sin fallback peligroso)", async () => {
    await activePage.goto(`${base}/name-trap`);
    const urlBefore = activePage.url();
    // El name "Acerca de" no existe como atributo en la página, pero su valor
    // coincide como substring con el texto del enlace real. Sin el fallback por
    // name, clickAdaptive debe lanzar en vez de clickear el elemento equivocado.
    await expect(clickAdaptive(activePage, 'a[name="Acerca de"]', 2_000)).rejects.toThrow();
    expect(activePage.url()).toBe(urlBefore);
  }, 20_000);
});
