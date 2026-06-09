// worker/test/gemini-quota.test.ts
import { describe, expect, it } from "vitest";
import { classifyQuotaError } from "../lib/gemini";

// El ApiError de @google/genai expone `message: string`, y ese string incluye
// el body JSON del 429 (quotaId + RetryInfo). Estos fixtures imitan esa forma.
function daily429(retryDelay?: string): { status: number; message: string } {
  const retry = retryDelay
    ? `,{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"${retryDelay}"}`
    : "";
  return {
    status: 429,
    message: `got status: 429 RESOURCE_EXHAUSTED. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}${retry}]}}`,
  };
}

function perMinute429(retryDelay?: string): { status: number; message: string } {
  const retry = retryDelay
    ? `,{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"${retryDelay}"}`
    : "";
  return {
    status: 429,
    message: `got status: 429 RESOURCE_EXHAUSTED. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}${retry}]}}`,
  };
}

describe("classifyQuotaError", () => {
  it("clasifica el quota diario (PerDay) como 'daily'", () => {
    expect(classifyQuotaError(daily429()).kind).toBe("daily");
  });

  it("reconoce la variante textual 'per day'", () => {
    expect(
      classifyQuotaError({ message: "quota exceeded: requests per day limit" })
        .kind,
    ).toBe("daily");
  });

  it("clasifica el quota por minuto como 'transient'", () => {
    expect(classifyQuotaError(perMinute429()).kind).toBe("transient");
  });

  it("default seguro: sin señal reconocible cae en 'transient'", () => {
    expect(classifyQuotaError({ message: "429 RESOURCE_EXHAUSTED" }).kind).toBe(
      "transient",
    );
    expect(classifyQuotaError(undefined).kind).toBe("transient");
    expect(classifyQuotaError("boom").kind).toBe("transient");
  });

  it("extrae retryDelay en segundos (entero)", () => {
    expect(classifyQuotaError(perMinute429("21s")).retryDelaySeconds).toBe(21);
  });

  it("redondea hacia arriba un retryDelay decimal", () => {
    expect(classifyQuotaError(perMinute429("4.5s")).retryDelaySeconds).toBe(5);
  });

  it("omite retryDelaySeconds cuando no está presente", () => {
    expect(classifyQuotaError(perMinute429()).retryDelaySeconds).toBeUndefined();
  });

  it("lee el message aunque venga como Error real", () => {
    const err = Object.assign(new Error(daily429().message), { status: 429 });
    expect(classifyQuotaError(err).kind).toBe("daily");
  });
});
