import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { sweepOrphanRuns } from "../sweep-orphan-runs";
import { createSupabaseAdminClient } from "../lib/supabase-admin";

type QueryResult = { data: unknown; error: unknown };

function makeClient(result: QueryResult) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn((payload: unknown) => {
    calls.update = payload;
    return builder;
  });
  builder.in = vi.fn((col: string, vals: unknown) => {
    calls.in = { col, vals };
    return builder;
  });
  builder.lt = vi.fn((col: string, val: unknown) => {
    calls.lt = { col, val };
    return builder;
  });
  builder.select = vi.fn(() => Promise.resolve(result));
  return { client: { from: vi.fn(() => builder) }, calls };
}

describe("sweepOrphanRuns", () => {
  it("marca fallidos los runs pendientes/corriendo viejos y devuelve el conteo", async () => {
    const { client, calls } = makeClient({
      data: [{ id: "r1" }, { id: "r2" }],
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);

    const count = await sweepOrphanRuns();

    expect(count).toBe(2);
    expect(calls.in).toEqual({
      col: "status",
      vals: ["pendiente", "corriendo"],
    });
    expect((calls.lt as { col: string }).col).toBe("created_at");
    expect((calls.update as { status: string }).status).toBe("fallido");
  });

  it("devuelve 0 si la query falla", async () => {
    const { client } = makeClient({ data: null, error: { message: "boom" } });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    expect(await sweepOrphanRuns()).toBe(0);
  });
});
