import { describe, expect, it } from "vitest";
import {
  isEmailFillSelector,
  isLoginSubmitSelector,
  isPasswordFillSelector,
  looksLikeEmail,
} from "@/lib/playwright/adaptive-login";

describe("isEmailFillSelector", () => {
  it("detecta type=email", () => {
    expect(isEmailFillSelector('input[type="email"]')).toBe(true);
  });

  it("detecta términos largos de identificador", () => {
    expect(isEmailFillSelector('input[name="usuario"]')).toBe(true);
    expect(isEmailFillSelector('input[placeholder="Número de documento"]')).toBe(true);
    expect(isEmailFillSelector('input[name="cedula"]')).toBe(true);
  });

  it("detecta tokens cortos solo con límite de palabra", () => {
    expect(isEmailFillSelector('input[name="cc"]')).toBe(true);
    expect(isEmailFillSelector('input[name="dni"]')).toBe(true);
    expect(isEmailFillSelector('input[id="rut"]')).toBe(true);
  });

  it("no produce falsos positivos por tokens cortos como substring", () => {
    expect(isEmailFillSelector('input[name="account"]')).toBe(false);
    expect(isEmailFillSelector('input[name="unit"]')).toBe(false);
    expect(isEmailFillSelector("#monitor")).toBe(false);
  });

  it("ignora selectores de password", () => {
    expect(isEmailFillSelector('input[type="password"]')).toBe(false);
  });
});

describe("isPasswordFillSelector", () => {
  it("detecta type=password y términos de clave", () => {
    expect(isPasswordFillSelector('input[type="password"]')).toBe(true);
    expect(isPasswordFillSelector('input[name="clave"]')).toBe(true);
  });

  it("no detecta un campo de usuario", () => {
    expect(isPasswordFillSelector('input[name="usuario"]')).toBe(false);
  });
});

describe("isLoginSubmitSelector", () => {
  it("detecta botones de submit y verbos de login", () => {
    expect(isLoginSubmitSelector('button[type="submit"]')).toBe(true);
    expect(isLoginSubmitSelector("text=Ingresar")).toBe(true);
  });

  it("no detecta un input de texto", () => {
    expect(isLoginSubmitSelector('input[name="usuario"]')).toBe(false);
  });
});

describe("looksLikeEmail", () => {
  it("acepta emails bien formados (recortando espacios)", () => {
    expect(looksLikeEmail("admin@test.com")).toBe(true);
    expect(looksLikeEmail("  admin@test.com  ")).toBe(true);
  });

  it("rechaza credenciales que no son email", () => {
    expect(looksLikeEmail("1098765432")).toBe(false);
    expect(looksLikeEmail("juan.perez")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
  });
});
