// worker/lib/adaptive-ecommerce.ts
import type { Locator, Page } from "playwright-core";
import {
  SETTLE_TIMEOUT_MS,
  isSuccessTextVisible,
  pickFirstVisibleOrNull,
} from "./adaptive-common";
import { resolveField } from "./adaptive-formulario";

const ADD_TO_CART_REGEX =
  /(add to cart|add to bag|agregar al carrito|añadir al carrito|anadir al carrito|añadir|anadir|agregar|comprar|buy now|buy)/i;
const CHECKOUT_NAV_REGEX =
  /(checkout|place order|realizar pedido|finalizar compra|finalizar|proceed|ir al carrito|ver carrito|cart|carrito|basket|bag)/i;
const CONFIRM_ORDER_REGEX =
  /(purchase|place order|pay\b|pagar|confirmar compra|confirmar pedido|comprar ahora|comprar|finalizar compra|complete order|submit order)/i;
const PAYMENT_FIELD_REGEX =
  /(card|tarjeta|cc-number|cardnumber|credit|cvc|cvv|security code|expir|vencimiento|mm\/aa|mm\/yy)/i;

export function isAddToCartSelector(selector?: string | null): boolean {
  return !!selector && ADD_TO_CART_REGEX.test(selector.toLowerCase());
}
export function isCheckoutNavSelector(selector?: string | null): boolean {
  return !!selector && CHECKOUT_NAV_REGEX.test(selector.toLowerCase());
}
export function isConfirmOrderSelector(selector?: string | null): boolean {
  return !!selector && CONFIRM_ORDER_REGEX.test(selector.toLowerCase());
}
export function isPaymentFieldSelector(selector?: string | null): boolean {
  return !!selector && PAYMENT_FIELD_REGEX.test(selector.toLowerCase());
}

export function splitExpiry(expiry: string): { month: string; year: string } {
  const m = expiry.trim().match(/^(\d{1,2})\s*[/\-]\s*(\d{2,4})$/);
  if (!m) return { month: "", year: "" };
  return { month: m[1]!.padStart(2, "0"), year: m[2]! };
}

export type StageOutcome = { success: boolean; reason: string };
export type OrderOutcome = {
  success: boolean;
  finalUrl: string;
  reason: string;
};
export type EcommerceData = {
  email: string;
  card: string;
  expiry: string;
  cvc: string;
};

const ORDER_CONFIRM_TIMEOUT_MS = 8_000;
const POLL_MS = 300;

export async function findAddToCart(page: Page): Promise<Locator | null> {
  return pickFirstVisibleOrNull([
    page.getByRole("button", { name: ADD_TO_CART_REGEX }),
    page.getByRole("link", { name: ADD_TO_CART_REGEX }),
    page
      .locator(':is(button, a, [role="button"])')
      .filter({ hasText: ADD_TO_CART_REGEX }),
    page.locator('[data-testid*="add-to-cart" i], [class*="add-to-cart" i]'),
  ]);
}

export async function addToCartStage(
  page: Page,
  timeoutMs: number,
): Promise<StageOutcome> {
  // Aceptar diálogos nativos (algunas tiendas hacen alert("Producto agregado")).
  // Reset previo para no acumular listeners duplicados entre llamadas sucesivas.
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => void d.accept().catch(() => {}));
  const button = await findAddToCart(page);
  if (!button)
    return {
      success: false,
      reason: "No se encontró el botón de agregar al carrito.",
    };
  await button.click({ timeout: timeoutMs });
  await page.waitForTimeout(POLL_MS);
  return { success: true, reason: "Producto agregado al carrito." };
}

export async function goToCheckoutStage(
  page: Page,
  timeoutMs: number,
): Promise<StageOutcome> {
  const nav = await pickFirstVisibleOrNull([
    page.getByRole("link", { name: CHECKOUT_NAV_REGEX }),
    page.getByRole("button", { name: CHECKOUT_NAV_REGEX }),
    page
      .locator(':is(a, button, [role="button"])')
      .filter({ hasText: CHECKOUT_NAV_REGEX }),
    page.locator('[href*="cart" i], [href*="checkout" i]'),
  ]);
  if (!nav)
    return {
      success: false,
      reason: "No se encontró cómo ir al carrito/checkout.",
    };
  await nav.click({ timeout: timeoutMs });
  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});
  return { success: true, reason: "Avanzó al carrito/checkout." };
}

export async function fillPaymentStage(
  page: Page,
  data: EcommerceData,
  timeoutMs: number,
): Promise<StageOutcome> {
  // Email (si lo pide el checkout).
  if (data.email) {
    const emailCtl = await resolveField(page, "email");
    if (emailCtl)
      await emailCtl.fill(data.email, { timeout: timeoutMs }).catch(() => {});
  }
  // Tarjeta. Orden: name/autocomplete primero, luego id, label/placeholder al final.
  const cardCtl = await pickFirstVisibleOrNull([
    page.locator('input[name*="card" i]:not([name*="holder" i])'),
    page.locator('input[autocomplete="cc-number"]'),
    page.locator('input[id*="card" i]:not([id*="holder" i])'),
    page.getByLabel(/credit\s*card|tarjeta|card number|número de tarjeta/i),
    page.getByPlaceholder(/(card|tarjeta|número de tarjeta)/i),
  ]);
  if (cardCtl)
    await cardCtl.fill(data.card, { timeout: timeoutMs }).catch(() => {});

  // Expiry: campo único o mes/año separados.
  const { month, year } = splitExpiry(data.expiry);
  const expCombined = await pickFirstVisibleOrNull([
    page.locator('input[autocomplete="cc-exp"]'),
    page.locator('input[id*="exp" i]'),
    page.getByLabel(/exp|vencimiento|mm\s*\/\s*(aa|yy)/i),
    page.getByPlaceholder(/(mm\/aa|mm\/yy|expir|vencimiento)/i),
  ]);
  if (expCombined) {
    await expCombined.fill(data.expiry, { timeout: timeoutMs }).catch(() => {});
  } else {
    const monthCtl = await pickFirstVisibleOrNull([
      page.locator('input[name*="month" i], input[name*="mes" i]'),
      page.locator('input[id*="month" i], input[id*="mes" i]'),
      page.getByLabel(/month|mes/i),
    ]);
    const yearCtl = await pickFirstVisibleOrNull([
      page.locator(
        'input[name*="year" i], input[name*="anio" i], input[name*="año" i]',
      ),
      page.locator(
        'input[id*="year" i], input[id*="anio" i], input[id*="año" i]',
      ),
      page.getByLabel(/year|año|anio/i),
    ]);
    if (monthCtl && month)
      await monthCtl.fill(month, { timeout: timeoutMs }).catch(() => {});
    if (yearCtl && year)
      await yearCtl.fill(year, { timeout: timeoutMs }).catch(() => {});
  }

  // CVC.
  const cvcCtl = await pickFirstVisibleOrNull([
    page.locator('input[name*="cvc" i], input[name*="cvv" i]'),
    page.locator('input[autocomplete="cc-csc"]'),
    page.locator('input[id*="cvc" i], input[id*="cvv" i]'),
    page.getByLabel(/cvc|cvv|security code|código de seguridad/i),
    page.getByPlaceholder(/(cvc|cvv|security code|código de seguridad)/i),
  ]);
  if (cvcCtl)
    await cvcCtl.fill(data.cvc, { timeout: timeoutMs }).catch(() => {});

  return {
    success: true,
    reason: "Datos de pago completados (los campos ausentes se omiten).",
  };
}

export async function confirmOrderAndVerify(
  page: Page,
  timeoutMs: number,
): Promise<OrderOutcome> {
  const confirm = await pickFirstVisibleOrNull([
    page.getByRole("button", { name: CONFIRM_ORDER_REGEX }),
    page
      .locator(':is(button, a, [role="button"])')
      .filter({ hasText: CONFIRM_ORDER_REGEX }),
    page.locator('input[type="submit"]'),
  ]);
  if (!confirm) {
    return {
      success: false,
      finalUrl: page.url(),
      reason: "No se encontró el botón de confirmar/pagar.",
    };
  }
  await confirm.click({ timeout: timeoutMs });
  await page.waitForTimeout(POLL_MS);

  const deadline = Date.now() + ORDER_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isSuccessTextVisible(page)) {
      return {
        success: true,
        finalUrl: page.url(),
        reason: "Confirmación de orden detectada (mensaje de éxito).",
      };
    }
    await page.waitForTimeout(POLL_MS);
  }
  return {
    success: false,
    finalUrl: page.url(),
    reason:
      "No se detectó confirmación de la orden tras pagar. La compra no se pudo " +
      "verificar por comportamiento (posible pago en iframe, validación fallida o " +
      "flujo distinto). Revisa el screenshot.",
  };
}
