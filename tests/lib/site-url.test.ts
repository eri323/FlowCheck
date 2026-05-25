import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSiteUrl } from "@/lib/site-url";

describe("getSiteUrl", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it("prioriza NEXT_PUBLIC_SITE_URL y le quita la barra final", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowcheck.app/";
    expect(getSiteUrl("https://preview.vercel.app")).toBe(
      "https://flowcheck.app",
    );
  });

  it("usa el origin del request cuando no hay variable configurada", () => {
    expect(getSiteUrl("https://preview.vercel.app")).toBe(
      "https://preview.vercel.app",
    );
  });

  it("cae a localhost cuando no hay variable ni origin", () => {
    expect(getSiteUrl(null)).toBe("http://localhost:3000");
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});
