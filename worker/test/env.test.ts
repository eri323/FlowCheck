import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertWorkerEnv } from "../lib/env";

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "WORKER_SECRET",
] as const;

describe("assertWorkerEnv", () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of REQUIRED) {
      snapshot[key] = process.env[key];
      process.env[key] = "presente";
    }
  });

  afterEach(() => {
    for (const key of REQUIRED) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it("no lanza cuando todas las variables están presentes", () => {
    expect(() => assertWorkerEnv()).not.toThrow();
  });

  it("trata una variable vacía como faltante", () => {
    process.env.WORKER_SECRET = "   ";
    expect(() => assertWorkerEnv()).toThrow("WORKER_SECRET");
  });

  it("lanza nombrando la variable faltante", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => assertWorkerEnv()).toThrow("GEMINI_API_KEY");
  });

  it("lista todas las variables faltantes en orden", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.GEMINI_API_KEY;
    expect(() => assertWorkerEnv()).toThrow("SUPABASE_URL, GEMINI_API_KEY");
  });
});
