import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../concurrency", () => ({ enqueueExclusive: vi.fn() }));
vi.mock("../process-test-run", () => ({ processTestRun: vi.fn() }));
vi.mock("../sweep-orphan-runs", () => ({ sweepOrphanRuns: vi.fn() }));

import { createApp } from "../server";
import { enqueueExclusive } from "../concurrency";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

describe("worker server — POST /run-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKER_SECRET = "s3cr3t";
  });
  afterEach(() => {
    delete process.env.WORKER_SECRET;
  });

  it("responde 401 sin el secreto correcto", async () => {
    const res = await request(createApp())
      .post("/run-test")
      .set("Authorization", "Bearer wrong")
      .send({ testRunId: VALID_ID });
    expect(res.status).toBe(401);
    expect(enqueueExclusive).not.toHaveBeenCalled();
  });

  it("responde 400 si el body es inválido", async () => {
    const res = await request(createApp())
      .post("/run-test")
      .set("Authorization", "Bearer s3cr3t")
      .send({ testRunId: "no-es-uuid" });
    expect(res.status).toBe(400);
    expect(enqueueExclusive).not.toHaveBeenCalled();
  });

  it("responde 202 y encola el run cuando todo es válido", async () => {
    const res = await request(createApp())
      .post("/run-test")
      .set("Authorization", "Bearer s3cr3t")
      .send({ testRunId: VALID_ID });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, testRunId: VALID_ID });
    expect(enqueueExclusive).toHaveBeenCalledTimes(1);
  });

  it("responde 200 en /health", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
