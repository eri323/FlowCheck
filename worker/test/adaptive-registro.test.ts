// worker/test/adaptive-registro.test.ts
import { describe, expect, it } from "vitest";
import {
  isConfirmPasswordSelector,
  isNameFillSelector,
  isRegisterSubmitSelector,
} from "../lib/adaptive-registro";

describe("isNameFillSelector", () => {
  it("detecta campos de nombre", () => {
    expect(isNameFillSelector('input[name="name"]')).toBe(true);
    expect(isNameFillSelector('input[name="nombre"]')).toBe(true);
    expect(isNameFillSelector('input[name="fullname"]')).toBe(true);
    expect(isNameFillSelector('[placeholder="Nombre completo"]')).toBe(true);
  });
  it("no marca email ni password", () => {
    expect(isNameFillSelector('input[type="email"]')).toBe(false);
    expect(isNameFillSelector('input[type="password"]')).toBe(false);
  });
});

describe("isConfirmPasswordSelector", () => {
  it("detecta confirmación de contraseña", () => {
    expect(isConfirmPasswordSelector('input[name="confirmPassword"]')).toBe(true);
    expect(isConfirmPasswordSelector('input[name="password_confirmation"]')).toBe(true);
    expect(isConfirmPasswordSelector('[placeholder="Repetir contraseña"]')).toBe(true);
  });
  it("no marca la contraseña principal", () => {
    expect(isConfirmPasswordSelector('input[name="password"]')).toBe(false);
  });
});

describe("isRegisterSubmitSelector", () => {
  it("detecta verbos de registro", () => {
    expect(isRegisterSubmitSelector('text=Crear cuenta')).toBe(true);
    expect(isRegisterSubmitSelector('role=button[name="Sign up"]')).toBe(true);
    expect(isRegisterSubmitSelector('button[type="submit"]')).toBe(true);
  });
  it("no marca un input de texto", () => {
    expect(isRegisterSubmitSelector('input[name="email"]')).toBe(false);
  });
});
