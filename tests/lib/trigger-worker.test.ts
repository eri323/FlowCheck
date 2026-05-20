import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerWorkerRun } from "@/lib/worker/trigger-worker";

describe("triggerWorkerRun", () => {
  beforeEach(() => {
    process.env.WORKER_URL = "https://worker.test";
    process.env.WORKER_SECRET = "s3cr3t";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WORKER_URL;
    delete process.env.WORKER_SECRET;
  });

  it("hace POST a /run-test con el secreto y el testRunId", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    await triggerWorkerRun("run-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.test/run-test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer s3cr3t" }),
        body: JSON.stringify({ testRunId: "run-1" }),
      }),
    );
  });

  it("lanza error si el worker responde con estado no OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    await expect(triggerWorkerRun("run-1")).rejects.toThrow("estado 500");
  });

  it("lanza error si faltan las variables de entorno", async () => {
    delete process.env.WORKER_URL;
    await expect(triggerWorkerRun("run-1")).rejects.toThrow("WORKER_URL");
  });
});
