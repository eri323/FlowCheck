import { beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks: Array<() => unknown> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb);
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/worker/trigger-worker", () => ({
  triggerWorkerRun: vi.fn(),
}));

type AuthUser = { id: string } | null;
type SupabaseError = { message: string } | null;

type SupabaseMockOptions = {
  user: AuthUser;
  authError?: SupabaseError;
  recentCount?: number;
  rateError?: SupabaseError;
  insertData?: { id: string } | null;
  insertError?: SupabaseError;
};

type SupabaseMock = {
  client: unknown;
  inserts: Array<Record<string, unknown>>;
};

function makeSupabaseMock(opts: SupabaseMockOptions): SupabaseMock {
  const inserts: Array<Record<string, unknown>> = [];

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user },
        error: opts.authError ?? null,
      }),
    },
    from: vi.fn(() => {
      let mode: "count" | "insert" | "idle" = "idle";
      const builder: Record<string, unknown> = {};

      builder.select = vi.fn(
        (_cols: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === "exact" && options.head === true) {
            mode = "count";
          }
          return builder;
        },
      );
      builder.insert = vi.fn((payload: Record<string, unknown>) => {
        mode = "insert";
        inserts.push(payload);
        return builder;
      });
      builder.eq = vi.fn(() => builder);
      builder.gte = vi.fn(() => builder);
      builder.single = vi.fn(async () => ({
        data: opts.insertData ?? null,
        error: opts.insertError ?? null,
      }));
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        if (mode === "count") {
          return Promise.resolve({
            count: opts.recentCount ?? 0,
            error: opts.rateError ?? null,
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      };
      return builder;
    }),
  };

  return { client, inserts };
}

type AdminMock = { client: unknown; updates: Array<Record<string, unknown>> };

function makeAdminMock(): AdminMock {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.update = vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return builder;
      });
      builder.eq = vi.fn(async () => ({ data: null, error: null }));
      return builder;
    }),
  };
  return { client, updates };
}

function makeRequest(body: unknown, options: { rawBody?: string } = {}): Request {
  return new Request("http://localhost/api/test-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

async function runAfterCallbacks(): Promise<void> {
  for (const cb of afterCallbacks) {
    await cb();
  }
}

const validBody = {
  test_type: "navegacion" as const,
  test_data: {},
  target_url: "https://example.com",
};

async function loadRoute() {
  const route = await import("@/app/api/test-runs/route");
  const supabaseServer = await import("@/lib/supabase/server");
  const admin = await import("@/lib/supabase/admin");
  const worker = await import("@/lib/worker/trigger-worker");
  return {
    POST: route.POST,
    createSupabaseServerClient: vi.mocked(
      supabaseServer.createSupabaseServerClient,
    ),
    createSupabaseAdminClient: vi.mocked(admin.createSupabaseAdminClient),
    triggerWorkerRun: vi.mocked(worker.triggerWorkerRun),
  };
}

describe("POST /api/test-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
  });

  it("devuelve 401 si no hay usuario autenticado", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: null });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it("devuelve 400 si el body no es JSON", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" } });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(undefined, { rawBody: "no-es-json" }));
    expect(response.status).toBe(400);
  });

  it("devuelve 400 si la validación de Zod falla", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" } });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(
      makeRequest({
        test_type: "navegacion",
        test_data: {},
        target_url: "javascript:alert(1)",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("devuelve 429 cuando el usuario supera el rate limit", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" }, recentCount: 5 });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(triggerWorkerRun).not.toHaveBeenCalled();
  });

  it("devuelve 201 y dispara el worker cuando todo es válido", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client } = makeSupabaseMock({
      user: { id: "u1" },
      recentCount: 2,
      insertData: { id: "run-123" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    triggerWorkerRun.mockResolvedValue(undefined);

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, testRunId: "run-123" });

    await runAfterCallbacks();
    expect(triggerWorkerRun).toHaveBeenCalledWith("run-123");
  });

  it("persiste browser y device en el insert", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client, inserts } = makeSupabaseMock({
      user: { id: "u1" },
      recentCount: 0,
      insertData: { id: "run-r" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    triggerWorkerRun.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ ...validBody, device: "mobile" }));
    expect(response.status).toBe(201);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ browser: "chromium", device: "mobile" });
    expect(inserts[0]).not.toHaveProperty("retries");
  });

  it("devuelve 500 si falla la inserción en la DB", async () => {
    const { POST, createSupabaseServerClient, triggerWorkerRun } =
      await loadRoute();
    const { client } = makeSupabaseMock({
      user: { id: "u1" },
      insertData: null,
      insertError: { message: "boom" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    expect(triggerWorkerRun).not.toHaveBeenCalled();
  });

  it("marca el run como fallido si no se puede contactar al worker", async () => {
    const {
      POST,
      createSupabaseServerClient,
      createSupabaseAdminClient,
      triggerWorkerRun,
    } = await loadRoute();
    const { client } = makeSupabaseMock({
      user: { id: "u1" },
      insertData: { id: "run-xyz" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    const admin = makeAdminMock();
    createSupabaseAdminClient.mockReturnValue(
      admin.client as unknown as ReturnType<typeof createSupabaseAdminClient>,
    );
    triggerWorkerRun.mockRejectedValue(new Error("worker dormido"));

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);

    await runAfterCallbacks();
    expect(admin.updates).toHaveLength(1);
    expect(admin.updates[0]).toMatchObject({ status: "fallido" });
  });
});
