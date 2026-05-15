import { Worker, type Job } from "bullmq";
import { processTestRun } from "./process-test-run";
import { getRedisConnection } from "../lib/queue/connection";
import {
  TEST_RUN_QUEUE_NAME,
  type TestRunJobData,
} from "../lib/queue/test-run-queue";

const CONCURRENCY = 3;

async function runOnce(testRunId: string): Promise<void> {
  console.log(`[manual] Procesando test_run ${testRunId}...`);
  const result = await processTestRun(testRunId);
  const { passed, failed, skipped } = result.stepCounts;
  console.log(
    `[manual] Test_run ${testRunId} terminó con estado "${result.status}" — pasos: ${passed} passed, ${failed} failed, ${skipped} skipped.`,
  );
}

function runWorker(): Worker<TestRunJobData> {
  const connection = getRedisConnection();
  const worker = new Worker<TestRunJobData>(
    TEST_RUN_QUEUE_NAME,
    async (job: Job<TestRunJobData>) => {
      const { testRunId } = job.data;
      console.log(
        `[job ${job.id}] start test_run=${testRunId} attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`,
      );
      const result = await processTestRun(testRunId);
      const { passed, failed, skipped } = result.stepCounts;
      console.log(
        `[job ${job.id}] end test_run=${testRunId} status=${result.status} passed=${passed} failed=${failed} skipped=${skipped}`,
      );
      return result;
    },
    {
      connection,
      concurrency: CONCURRENCY,
    },
  );

  worker.on("failed", (job, error) => {
    const id = job?.id ?? "<unknown>";
    const attempts = job?.attemptsMade ?? 0;
    const max = job?.opts.attempts ?? 1;
    console.error(
      `[job ${id}] failed attempt=${attempts}/${max}: ${error.message}`,
    );
  });

  worker.on("error", (error) => {
    console.error(`[worker] error: ${error.message}`);
  });

  return worker;
}

async function main(): Promise<void> {
  const manualId = process.argv[2];

  if (manualId) {
    await runOnce(manualId);
    return;
  }

  console.log(
    `[worker] Escuchando cola "${TEST_RUN_QUEUE_NAME}" con concurrencia=${CONCURRENCY}. Ctrl+C para salir.`,
  );
  const worker = runWorker();

  const shutdown = async (signal: string) => {
    console.log(`\n[worker] ${signal} recibido — cerrando...`);
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[worker] error fatal: ${message}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
