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
      expect(result.data.retries).toBe(1);
    }
  });

  it("acepta device 'mobile' y un número de reintentos válido", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      browser: "chromium",
      device: "mobile",
      retries: 3,
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

  it("rechaza un número de reintentos fuera de rango", () => {
    const result = createTestRunSchema.safeParse({
      ...base,
      test_type: "navegacion",
      test_data: {},
      retries: 9,
    });
    expect(result.success).toBe(false);
  });
});
