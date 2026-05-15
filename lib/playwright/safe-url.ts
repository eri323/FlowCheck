const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function assertSafeNavigationUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`URL inválida para navegación: "${value}"`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Esquema de URL no permitido (${parsed.protocol}). Solo http o https.`,
    );
  }
}
