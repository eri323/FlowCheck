// worker/test/adaptive-formulario.test.ts
import { describe, expect, it } from "vitest";
import { asBoolean, isFormSubmitSelector, parseFields } from "../lib/adaptive-formulario";

describe("parseFields", () => {
  it("parsea pares 'label: value' por línea", () => {
    expect(parseFields("Nombre: Ana\nEmail: ana@x.com")).toEqual([
      { label: "Nombre", value: "Ana" },
      { label: "Email", value: "ana@x.com" },
    ]);
  });
  it("acepta '=' y corta en el primer separador", () => {
    expect(parseFields("Comentario = a: b: c")).toEqual([
      { label: "Comentario", value: "a: b: c" },
    ]);
  });
  it("ignora líneas vacías y sin separador", () => {
    expect(parseFields("\nlinea sin separador\nCiudad: Bogotá\n")).toEqual([
      { label: "Ciudad", value: "Bogotá" },
    ]);
  });
});

describe("asBoolean", () => {
  it("reconoce verdaderos y falsos", () => {
    expect(asBoolean("sí")).toBe(true);
    expect(asBoolean("true")).toBe(true);
    expect(asBoolean("x")).toBe(true);
    expect(asBoolean("no")).toBe(false);
    expect(asBoolean("false")).toBe(false);
  });
  it("devuelve null si no es booleano", () => {
    expect(asBoolean("Bogotá")).toBeNull();
  });
});

describe("isFormSubmitSelector", () => {
  it("detecta selectores de submit", () => {
    expect(isFormSubmitSelector('button[type="submit"]')).toBe(true);
    expect(isFormSubmitSelector('text=Enviar')).toBe(true);
    expect(isFormSubmitSelector('role=button[name="Guardar"]')).toBe(true);
  });
  it("no marca un input de texto", () => {
    expect(isFormSubmitSelector('input[name="ciudad"]')).toBe(false);
  });
});
