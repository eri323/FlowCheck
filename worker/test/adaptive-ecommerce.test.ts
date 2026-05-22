// worker/test/adaptive-ecommerce.test.ts
import { describe, expect, it } from "vitest";
import {
  isAddToCartSelector,
  isCheckoutNavSelector,
  isConfirmOrderSelector,
  isPaymentFieldSelector,
  splitExpiry,
} from "../lib/adaptive-ecommerce";

describe("detectores de ecommerce", () => {
  it("isAddToCartSelector", () => {
    expect(isAddToCartSelector("text=Add to cart")).toBe(true);
    expect(isAddToCartSelector("text=Agregar al carrito")).toBe(true);
    expect(isAddToCartSelector("text=Añadir")).toBe(true);
    expect(isAddToCartSelector('input[name="email"]')).toBe(false);
  });
  it("isCheckoutNavSelector", () => {
    expect(isCheckoutNavSelector("text=Checkout")).toBe(true);
    expect(isCheckoutNavSelector("text=Place Order")).toBe(true);
    expect(isCheckoutNavSelector("text=Realizar pedido")).toBe(true);
  });
  it("isConfirmOrderSelector", () => {
    expect(isConfirmOrderSelector("text=Purchase")).toBe(true);
    expect(isConfirmOrderSelector("text=Pagar")).toBe(true);
    expect(isConfirmOrderSelector("text=Comprar ahora")).toBe(true);
  });
  it("isPaymentFieldSelector", () => {
    expect(isPaymentFieldSelector('input[name="card"]')).toBe(true);
    expect(isPaymentFieldSelector('input[name="cvc"]')).toBe(true);
    expect(isPaymentFieldSelector('[placeholder="Número de tarjeta"]')).toBe(true);
    expect(isPaymentFieldSelector('input[name="city"]')).toBe(false);
  });
});

describe("splitExpiry", () => {
  it("parte MM/AA", () => {
    expect(splitExpiry("09/27")).toEqual({ month: "09", year: "27" });
  });
  it("tolera MM/AAAA", () => {
    expect(splitExpiry("12/2030")).toEqual({ month: "12", year: "2030" });
  });
  it("devuelve vacíos si no parsea", () => {
    expect(splitExpiry("xx")).toEqual({ month: "", year: "" });
  });
});
