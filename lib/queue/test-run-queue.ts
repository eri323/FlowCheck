import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

export const TEST_RUN_QUEUE_NAME = "test-runs";

export type TestRunJobData = {
  testRunId: string;
  userId: string;
};

let cachedQueue: Queue<TestRunJobData> | null = null;

export function getTestRunQueue(): Queue<TestRunJobData> {
  if (cachedQueue) return cachedQueue;
  cachedQueue = new Queue<TestRunJobData>(TEST_RUN_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 200 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return cachedQueue;
}

export async function enqueueTestRun(
  data: TestRunJobData,
  attempts = 3,
): Promise<void> {
  const queue = getTestRunQueue();
  await queue.add("process", data, { jobId: data.testRunId, attempts });
}
