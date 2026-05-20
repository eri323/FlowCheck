import express from "express";
import { z } from "zod";
import { enqueueExclusive } from "./concurrency";
import { processTestRun } from "./process-test-run";
import { sweepOrphanRuns } from "./sweep-orphan-runs";

const runTestSchema = z.object({ testRunId: z.uuid() });

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/run-test", (req, res) => {
    const secret = process.env.WORKER_SECRET;
    if (!secret || req.header("authorization") !== `Bearer ${secret}`) {
      res.status(401).json({ ok: false, message: "No autorizado" });
      return;
    }

    const parsed = runTestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ ok: false, message: "Body inválido: se espera { testRunId: uuid }" });
      return;
    }

    const { testRunId } = parsed.data;
    // 202 inmediato: el trabajo pesado corre en background, serializado.
    enqueueExclusive(async () => {
      await processTestRun(testRunId);
    });
    res.status(202).json({ ok: true, testRunId });
  });

  return app;
}

async function main(): Promise<void> {
  const swept = await sweepOrphanRuns();
  if (swept > 0) {
    console.log(
      `[worker] ${swept} run(s) huérfano(s) marcados como fallido al arrancar`,
    );
  }
  const port = Number(process.env.PORT) || 3001;
  createApp().listen(port, () => {
    console.log(`[worker] escuchando en el puerto ${port}`);
  });
}

// Vitest define NODE_ENV="test": no arranca el servidor al importar createApp.
if (process.env.NODE_ENV !== "test") {
  void main();
}
