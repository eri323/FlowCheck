// worker/test/adaptive-formulario.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { fillAndSubmitForm, fillField, resolveField } from "../lib/adaptive-formulario";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Form</title></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/labeled":
      res.end(html(`
        <form action="/done" method="get">
          <label>Nombre completo <input name="full"></label>
          <label>Mensaje <textarea name="msg"></textarea></label>
          <label>País <select name="country"><option>México</option><option>Colombia</option></select></label>
          <label>Acepto términos <input type="checkbox" name="tos"></label>
          <button type="submit">Enviar</button>
        </form>`));
      return;
    case "/done":
      res.end(html(`<h1>Gracias</h1><p>Formulario enviado correctamente</p>`));
      return;
    case "/noop":
      res.end(html(`
        <form id="f"><input name="a" placeholder="Campo A"><button type="submit">Enviar</button></form>
        <script>document.getElementById('f').addEventListener('submit', e => e.preventDefault());</script>`));
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

describe("resolveField + fillField (browser)", () => {
  it("resuelve por label y llena texto, textarea, select y checkbox", async () => {
    await activePage.goto(`${base}/labeled`);

    const name = await resolveField(activePage, "Nombre completo");
    expect(name).not.toBeNull();
    await fillField(name!, "Ana Pérez");
    expect(await activePage.locator('input[name="full"]').inputValue()).toBe("Ana Pérez");

    const msg = await resolveField(activePage, "Mensaje");
    await fillField(msg!, "Hola");
    expect(await activePage.locator('textarea[name="msg"]').inputValue()).toBe("Hola");

    const country = await resolveField(activePage, "País");
    await fillField(country!, "Colombia");
    expect(await activePage.locator('select[name="country"]').inputValue()).toBe("Colombia");

    const tos = await resolveField(activePage, "Acepto términos");
    await fillField(tos!, "sí");
    expect(await activePage.locator('input[name="tos"]').isChecked()).toBe(true);
  }, 30_000);
});

describe("fillAndSubmitForm (browser)", () => {
  it("llena por label, envía y verifica éxito (GET clásico)", async () => {
    await activePage.goto(`${base}/labeled`);
    const outcome = await fillAndSubmitForm(
      activePage,
      [
        { label: "Nombre completo", value: "Ana" },
        { label: "Mensaje", value: "Hola" },
      ],
      8_000,
    );
    expect(outcome.success).toBe(true);
    expect(outcome.finalUrl).toContain("/done");
  }, 30_000);

  it("trampa de falso positivo: form que no hace nada → success=false", async () => {
    await activePage.goto(`${base}/noop`);
    const outcome = await fillAndSubmitForm(
      activePage,
      [{ label: "Campo A", value: "valor" }],
      4_000,
      { resultsTimeoutMs: 1_500 },
    );
    expect(outcome.success).toBe(false);
  }, 30_000);
});
