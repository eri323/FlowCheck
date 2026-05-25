import { createSupabaseAdminClient } from "./lib/supabase-admin";

const STALE_MINUTES = 10;

/**
 * Marca como "fallido" los runs que quedaron en "pendiente" o "corriendo"
 * por más de STALE_MINUTES. Cubre los runs huérfanos por un reinicio del
 * worker (Render free tier duerme y reinicia el proceso). Se llama al
 * arrancar el servidor. Devuelve cuántos runs barrió.
 */
export async function sweepOrphanRuns(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const threshold = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from("test_runs")
    .update({
      status: "fallido",
      error_message: "El worker se reinició y el run quedó interrumpido.",
      finished_at: new Date().toISOString(),
    })
    .in("status", ["pendiente", "corriendo"])
    .lt("created_at", threshold)
    .select("id");

  if (error) {
    console.error(
      `[worker] el barrido de runs huérfanos falló: ${error.message}`,
    );
    return 0;
  }

  return data?.length ?? 0;
}
