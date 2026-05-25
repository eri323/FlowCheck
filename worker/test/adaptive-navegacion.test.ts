// worker/test/adaptive-navegacion.test.ts
import { describe, expect, it } from "vitest";
import { looksLikeErrorPage } from "../lib/adaptive-navegacion";

describe("looksLikeErrorPage", () => {
  it("detecta páginas de error con poco contenido", () => {
    expect(looksLikeErrorPage("404 Not Found", "404 Not Found")).toBe(true);
    expect(looksLikeErrorPage("Error", "500 Internal Server Error")).toBe(true);
    expect(looksLikeErrorPage("", "This page could not be found")).toBe(true);
  });

  it("no marca una página real con mucho contenido aunque mencione 'error'", () => {
    const body =
      "Bienvenido. ".repeat(80) + "Reporta cualquier error al soporte.";
    expect(looksLikeErrorPage("Inicio", body)).toBe(false);
  });

  it("no marca una home normal", () => {
    expect(looksLikeErrorPage("Mi Tienda", "Productos ".repeat(50))).toBe(
      false,
    );
  });
});
