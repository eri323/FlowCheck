// worker/test/adaptive-common.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  findGenericSubmit,
  pickFirstVisibleOrNull,
  readVisibleErrorText,
} from "../lib/adaptive-common";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/form":
      res.end(html(`<form><input name="x"><button type="submit">Guardar</button></form>`));
      return;
    case "/error":
      res.end(html(`<div role="alert">Credenciales inválidas</div>`));
      return;
    case "/hidden":
      res.end(html(`<button type="submit" style="display:none">Enviar</button>`));
      return;
    default:
      res.statusCode = 404;
      res.end(html("not found"));
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

describe("findGenericSubmit (browser)", () => {
  it("encuentra el botón de submit por type", async () => {
    await activePage.goto(`${base}/form`);
    const submit = await findGenericSubmit(activePage);
    expect((await submit.textContent())?.trim()).toBe("Guardar");
  }, 20_000);
});

describe("readVisibleErrorText (browser)", () => {
  it("lee un role=alert visible", async () => {
    await activePage.goto(`${base}/error`);
    expect(await readVisibleErrorText(activePage)).toContain("inválidas");
  }, 20_000);
});

describe("pickFirstVisibleOrNull (browser)", () => {
  it("devuelve null si el único candidato está oculto", async () => {
    await activePage.goto(`${base}/hidden`);
    const found = await pickFirstVisibleOrNull([
      activePage.locator('button[type="submit"]'),
    ]);
    expect(found).toBeNull();
  }, 20_000);
});
