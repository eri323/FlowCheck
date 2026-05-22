// worker/test/adaptive-ecommerce.integration.test.ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  addToCartStage,
  confirmOrderAndVerify,
  fillPaymentStage,
  goToCheckoutStage,
} from "../lib/adaptive-ecommerce";

function html(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shop</title></head><body>${body}</body></html>`;
}

// Tienda SPA mínima: agregar al carrito (contador), checkout (muestra form),
// confirmar (muestra "Thank you for your purchase").
const shop = `
  <div>Carrito: <span id="count">0</span></div>
  <button id="add">Add to cart</button>
  <a id="cart" href="#cart" style="display:none">Checkout</a>
  <form id="pay" style="display:none">
    <input name="card" placeholder="Card number">
    <input name="month" placeholder="MM">
    <input name="year" placeholder="YY">
    <input name="cvc" placeholder="CVC">
    <button type="button" id="buy">Purchase</button>
  </form>
  <div id="done"></div>
  <script>
    let n = 0;
    add.addEventListener('click', () => { n++; count.textContent = n; cart.style.display='inline'; });
    cart.addEventListener('click', () => { pay.style.display='block'; });
    buy.addEventListener('click', () => { done.innerHTML = '<h1>Thank you for your purchase!</h1>'; });
  </script>`;

// Tienda rota: botón comprar que no confirma nada (trampa de falso positivo).
const broken = `
  <button id="add">Add to cart</button>
  <a id="cart" href="#cart">Checkout</a>
  <form id="pay"><input name="card"><button type="button" id="buy">Purchase</button></form>
  <div id="done"></div>
  <script>
    add.addEventListener('click', () => {});
    buy.addEventListener('click', () => {});
  </script>`;

// Checkout estilo demoblaze: campos con SOLO `id` + <label for=...>,
// sin name/placeholder/autocomplete.
const idCheckout = `
  <form>
    <label for="card">Credit card:</label><input type="text" id="card">
    <label for="month">Month:</label><input type="text" id="month">
    <label for="year">Year:</label><input type="text" id="year">
  </form>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (url.pathname === "/shop") return void res.end(html(shop));
  if (url.pathname === "/broken") return void res.end(html(broken));
  if (url.pathname === "/idcheckout") return void res.end(html(idCheckout));
  res.statusCode = 404;
  res.end(html("not found"));
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

describe("flujo ecommerce (browser)", () => {
  it("carrito → checkout → pago → confirmación verde", async () => {
    await activePage.goto(`${base}/shop`);

    expect((await addToCartStage(activePage, 5_000)).success).toBe(true);
    expect((await goToCheckoutStage(activePage, 5_000)).success).toBe(true);
    expect(
      (await fillPaymentStage(
        activePage,
        { email: "a@x.com", card: "4111111111111111", expiry: "09/27", cvc: "123" },
        5_000,
      )).success,
    ).toBe(true);

    const order = await confirmOrderAndVerify(activePage, 5_000);
    expect(order.success).toBe(true);
  }, 40_000);

  it("resuelve campos de pago por id + label (estilo demoblaze, sin name/placeholder)", async () => {
    await activePage.goto(`${base}/idcheckout`);

    expect(
      (await fillPaymentStage(
        activePage,
        { email: "", card: "4111111111111111", expiry: "09/27", cvc: "123" },
        5_000,
      )).success,
    ).toBe(true);

    expect(await activePage.locator("#card").inputValue()).toBe("4111111111111111");
    expect(await activePage.locator("#month").inputValue()).toBe("09");
    expect(await activePage.locator("#year").inputValue()).toBe("27");
  }, 40_000);

  it("trampa: confirmar no produce confirmación → success=false", async () => {
    await activePage.goto(`${base}/broken`);
    await addToCartStage(activePage, 3_000).catch(() => {});
    await goToCheckoutStage(activePage, 3_000).catch(() => {});
    const order = await confirmOrderAndVerify(activePage, 2_000);
    expect(order.success).toBe(false);
  }, 40_000);
});
