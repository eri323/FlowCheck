import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/queue/test-run-queue", () => ({
  enqueueTestRun: vi.fn(),
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
  updates: Array<Record<string, unknown>>;
};

function makeSupabaseMock(opts: SupabaseMockOptions): SupabaseMock {
  const updates: Array<Record<string, unknown>> = [];

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user },
        error: opts.authError ?? null,
      }),
    },
    from: vi.fn(() => {
      let mode: "count" | "insert" | "update" | "idle" = "idle";

      const builder: Record<string, unknown> = {};

      builder.select = vi.fn((_cols: string, options?: { count?: string; head?: boolean }) => {
        if (options?.count === "exact" && options.head === true) {
          mode = "count";
        }
        return builder;
      });

      builder.insert = vi.fn(() => {
        mode = "insert";
        return builder;
      });

      builder.update = vi.fn((payload: Record<string, unknown>) => {
        mode = "update";
        updates.push(payload);
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

  return { client, updates };
}

function makeRequest(body: unknown, options: { rawBody?: string } = {}): Request {
  return new Request("http://localhost/api/test-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

const validBody = {
  test_type: "navegacion" as const,
  test_data: {},
  target_url: "https://example.com",
};

async function loadRoute() {
  const route = await import("@/app/api/test-runs/route");
  const supabaseServer = await import("@/lib/supabase/server");
  const queue = await import("@/lib/queue/test-run-queue");
  return {
    POST: route.POST,
    createSupabaseServerClient: vi.mocked(supabaseServer.createSupabaseServerClient),
    enqueueTestRun: vi.mocked(queue.enqueueTestRun),
  };
}

describe("POST /api/test-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 401 si no hay usuario autenticado", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: null });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.ok).toBe(false);
  });

  it("devuelve 400 si el body no es JSON", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" } });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(undefined, { rawBody: "no-es-json" }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.message).toContain("JSON");
  });

  it("devuelve 400 si la validación de Zod falla", async () => {
    const { POST, createSupabaseServerClient } = await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" } });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(
      makeRequest({ test_type: "navegacion", test_data: {}, target_url: "javascript:alert(1)" }),
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors).toBeDefined();
  });

  it("devuelve 429 cuando el usuario supera el rate limit", async () => {
    const { POST, createSupabaseServerClient, enqueueTestRun } = await loadRoute();
    const { client } = makeSupabaseMock({ user: { id: "u1" }, recentCount: 5 });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(enqueueTestRun).not.toHaveBeenCalled();
  });

  it("devuelve 201 y encola el job cuando todo es válido", async () => {
    const { POST, createSupabaseServerClient, enqueueTestRun } = await loadRoute();
    const { client } = makeSupabaseMock({
      user: { id: "u1" },
      recentCount: 2,
      insertData: { id: "run-123" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    enqueueTestRun.mockResolvedValue(undefined);

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toEqual({ ok: true, testRunId: "run-123" });
    expect(enqueueTestRun).toHaveBeenCalledWith({ testRunId: "run-123", userId: "u1" });
  });

  it("devuelve 500 si falla la inserción en la DB", async () => {
    const { POST, createSupabaseServerClient, enqueueTestRun } = await loadRoute();
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
    expect(enqueueTestRun).not.toHaveBeenCalled();
  });

  it("marca el test run como fallido si no se puede encolar", async () => {
    const { POST, createSupabaseServerClient, enqueueTestRun } = await loadRoute();
    const { client, updates } = makeSupabaseMock({
      user: { id: "u1" },
      insertData: { id: "run-xyz" },
    });
    createSupabaseServerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    enqueueTestRun.mockRejectedValue(new Error("redis caído"));

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "fallido" });
  });
});
