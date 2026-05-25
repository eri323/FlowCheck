// worker/test/adaptive-common.test.ts
import { describe, expect, it } from "vitest";
import { SUCCESS_TEXT_REGEX, SUBMIT_VERBS } from "../lib/adaptive-common";

describe("SUCCESS_TEXT_REGEX", () => {
  it("detecta mensajes de éxito ES/EN", () => {
    for (const t of [
      "¡Gracias por tu compra!",
      "Operación exitosa",
      "Mensaje enviado correctamente",
      "Tu cuenta fue creada",
      "Thank you for your purchase!",
      "Your order has been placed",
      "Form submitted successfully",
    ]) {
      expect(SUCCESS_TEXT_REGEX.test(t)).toBe(true);
    }
  });

  it("no dispara con texto neutro", () => {
    for (const t of ["Inicia sesión", "Productos destacados", "Acerca de"]) {
      expect(SUCCESS_TEXT_REGEX.test(t)).toBe(false);
    }
  });
});

describe("SUBMIT_VERBS", () => {
  it("incluye verbos de envío comunes", () => {
    for (const v of [
      "enviar",
      "submit",
      "guardar",
      "continuar",
      "aceptar",
      "confirmar",
    ]) {
      expect(SUBMIT_VERBS).toContain(v);
    }
  });
});
