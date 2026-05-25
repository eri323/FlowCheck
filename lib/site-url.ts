const DEV_FALLBACK_ORIGIN = "http://localhost:3000";

/**
 * Resuelve la URL pública del sitio para construir enlaces absolutos (p. ej. el
 * `emailRedirectTo` de Supabase Auth). Prioriza la configuración explícita
 * `NEXT_PUBLIC_SITE_URL` (el dominio canónico de producción), cae al `origin`
 * del request entrante (cubre los preview deployments) y, como último recurso de
 * desarrollo, a localhost. En producción, con la variable configurada, nunca
 * emite `localhost`.
 */
export function getSiteUrl(requestOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  return DEV_FALLBACK_ORIGIN;
}
