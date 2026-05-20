const WORKER_TIMEOUT_MS = 55_000;

/**
 * Dispara la ejecución de un test_run en el worker de Render. El worker
 * responde 202 apenas recibe la petición; el timeout de 55 s tolera el
 * cold start del free tier (el worker se duerme tras 15 min).
 */
export async function triggerWorkerRun(testRunId: string): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new Error(
      "WORKER_URL o WORKER_SECRET no están configuradas en el entorno",
    );
  }

  const response = await fetch(`${workerUrl}/run-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerSecret}`,
    },
    body: JSON.stringify({ testRunId }),
    signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`El worker respondió con estado ${response.status}`);
  }
}
