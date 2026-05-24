import { describe, expect, it } from "vitest";
import { createTestRunSchema } from "@/lib/validation/test-run";

const base = { target_url: "https://example.com" };

describe("createTestRunSchema — credencial de login", () => {
  it("acepta un login con credencial que no es email (CC / documento)", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "1098765432", password: "secreta123" },
    });
    expect(result.success).toBe(true);
  });

  it("acepta un login con credencial de tipo username", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "juan.perez", password: "secreta123" },
    });
    expect(result.success).toBe(true);
  });

  it("acepta un login con un email normal", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "admin@test.com", password: "secreta123" },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un login con credencial vacía", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "   ", password: "secreta123" },
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un login con credencial que tiene saltos de línea", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "login",
      test_data: { email: "usuario\ninyectado", password: "secreta123" },
    });
    expect(result.success).toBe(false);
  });

  it("sigue rechazando un email inválido en el flujo de registro", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "registro",
      test_data: {
        name: "Juan",
        email: "1098765432",
        password: "secreta123",
        confirmPassword: "secreta123",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("createTestRunSchema — configuración de runner", () => {
  it("aplica los defaults de runner cuando no se envían", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.browser).toBe("chromium");
      expect(result.data.device).toBe("desktop");
    }
  });

  it("acepta device 'mobile'", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      browser: "chromium",
      device: "mobile",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un navegador distinto de chromium en este ciclo", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      browser: "firefox",
    });
    expect(result.success).toBe(false);
  });
});

describe("createTestRunSchema — SSRF (host interno literal)", () => {
  const cases = [
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]:8080",
    "http://2130706433", // decimal de 127.0.0.1
    "http://10.0.0.5",
    "http://192.168.1.1",
  ];
  for (const target_url of cases) {
    it(`rechaza target_url interno: ${target_url}`, () => {
      const result = createTestRunSchema.safeParse({
        target_url,
        test_type: "navegacion",
        test_data: {},
      });
      expect(result.success).toBe(false);
    });
  }

  it("sigue aceptando una URL pública normal", () => {
    const result = createTestRunSchema.safeParse({
      target_url: "https://example.com",
      test_type: "navegacion",
      test_data: {},
    });
    expect(result.success).toBe(true);
  });
});
