// worker/lib/adaptive-navegacion.ts
import type { Page } from "playwright-core";
import { SETTLE_TIMEOUT_MS } from "./adaptive-common";

const ERROR_PAGE_REGEX =
  /\b(404|500|403|not found|page (not|could not be) found|internal server error|forbidden|service unavailable|something went wrong)\b/i;

// Umbral de contenido: por debajo, una mención de "error" es sospechosa.
const MIN_CONTENT_LENGTH = 200;

export function looksLikeErrorPage(title: string, bodyText: string): boolean {
  const text = `${title} ${bodyText}`.trim();
  if (!ERROR_PAGE_REGEX.test(text)) return false;
  // Si la página tiene contenido sustancial, la mención de error es incidental.
  return bodyText.trim().length < MIN_CONTENT_LENGTH;
}
