// worker/test/adaptive-registro.integration.test.ts
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
import { chromium, type Browser, type Page } from "playwright-core";
import {
  findConfirmPasswordField,
  findNameField,
  registerAndVerify,
} from "../lib/adaptive-registro";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Reg</title></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  switch (url.pathname) {
    case "/signup":
      res.end(
        html(`
        <form action="/welcome" method="get">
          <input name="name" placeholder="Nombre">
          <input type="email" name="email" placeholder="Email">
          <input type="password" name="password" placeholder="Contraseña">
          <input type="password" name="confirm" placeholder="Repetir contraseña">
          <button type="submit">Crear cuenta</button>
        </form>`),
      );
      return;
    case "/welcome":
      res.end(html(`<h1>Bienvenido</h1><p>Tu cuenta fue creada</p>`));
      return;
    case "/dup":
      // Trampa: siempre muestra error de email duplicado, no navega.
      res.end(
        html(`
        <form id="f">
          <input name="name"><input type="email" name="email">
          <input type="password" name="password">
          <button type="submit">Registrar</button>
        </form>
        <div role="alert" style="display:none" id="e">El email ya está en uso</div>
        <script>document.getElementById('f').addEventListener('submit', e => {
          e.preventDefault(); document.getElementById('e').style.display='block';
        });</script>`),
      );
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

describe("findNameField / findConfirmPasswordField (browser)", () => {
  it("encuentra nombre y el segundo password como confirmación", async () => {
    await activePage.goto(`${base}/signup`);
    expect(await (await findNameField(activePage))!.getAttribute("name")).toBe(
      "name",
    );
    expect(
      await (await findConfirmPasswordField(activePage))!.getAttribute("name"),
    ).toBe("confirm");
  }, 20_000);
});

describe("registerAndVerify (browser)", () => {
  it("registro exitoso → success por cambio de URL", async () => {
    await activePage.goto(`${base}/signup`);
    const outcome = await registerAndVerify(
      activePage,
      {
        name: "Ana",
        email: "ana@x.com",
        password: "Secret123",
        confirmPassword: "Secret123",
      },
      activePage.url(),
      8_000,
    );
    expect(outcome.success).toBe(true);
    expect(outcome.finalUrl).toContain("/welcome");
  }, 30_000);

  it("trampa: email duplicado → success=false con el error real", async () => {
    await activePage.goto(`${base}/dup`);
    const outcome = await registerAndVerify(
      activePage,
      {
        name: "Ana",
        email: "ana@x.com",
        password: "Secret123",
        confirmPassword: "Secret123",
      },
      activePage.url(),
      4_000,
    );
    expect(outcome.success).toBe(false);
    expect(outcome.reason.toLowerCase()).toContain("uso");
  }, 30_000);
});
