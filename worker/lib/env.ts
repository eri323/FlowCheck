const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "WORKER_SECRET",
] as const;

/**
 * Falla rápido si falta alguna variable de entorno indispensable para el worker.
 * Se invoca al arrancar (`main()` en `server.ts`), antes de escuchar, para que
 * un deploy mal configurado en Render muera con un mensaje claro en vez de
 * levantar un servidor que recién falla en el primer job. Queda fuera de
 * `createApp()` a propósito: los tests crean la app sin estas variables.
 */
export function assertWorkerEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = process.env[key];
    return value === undefined || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `[worker] faltan variables de entorno: ${missing.join(", ")}`,
    );
  }
}
