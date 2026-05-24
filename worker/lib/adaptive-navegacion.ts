// worker/lib/adaptive-navegacion.ts
import type { Locator, Page } from "playwright-core";
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

export type PageHealth = {
  healthy: boolean;
  finalUrl: string;
  title: string;
  reason: string;
};

// Umbral mínimo de contenido: por debajo se asume un render roto o en blanco
// (no solo un body totalmente vacío), señal de una página que no cargó bien.
const MIN_BODY_TEXT = 20;

export async function verifyPageHealthy(page: Page): Promise<PageHealth> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});

  const finalUrl = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = (
    await page.locator("body").innerText({ timeout: SETTLE_TIMEOUT_MS }).catch(() => "")
  ).trim();

  if (bodyText.length < MIN_BODY_TEXT) {
    return {
      healthy: false,
      finalUrl,
      title,
      reason: "La página no renderizó contenido de texto visible.",
    };
  }
  if (looksLikeErrorPage(title, bodyText)) {
    return {
      healthy: false,
      finalUrl,
      title,
      reason: `La página parece un documento de error (título: "${title}").`,
    };
  }
  return {
    healthy: true,
    finalUrl,
    title,
    reason: `Página sana: cargó, tiene título "${title}" y contenido renderizado.`,
  };
}

export async function clickAdaptive(
  page: Page,
  selector: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await page.locator(selector).first().click({ timeout: timeoutMs });
    return;
  } catch (literalError) {
    // Fallback: extraer texto del selector y buscar un enlace/botón por texto.
    // Se prefiere el nombre accesible (getByRole) antes que el substring crudo.
    const text = extractTextHint(selector);
    if (text) {
      const clickIfPresent = async (locator: Locator): Promise<boolean> => {
        if ((await locator.count().catch(() => 0)) > 0) {
          await locator.click({ timeout: timeoutMs });
          return true;
        }
        return false;
      };

      const link = page.getByRole("link", { name: text, exact: false }).first();
      if ((await link.count().catch(() => 0)) > 0 && (await link.isVisible().catch(() => false))) {
        await link.click({ timeout: timeoutMs });
        return;
      }

      const button = page.getByRole("button", { name: text, exact: false }).first();
      if (
        (await button.count().catch(() => 0)) > 0 &&
        (await button.isVisible().catch(() => false))
      ) {
        await button.click({ timeout: timeoutMs });
        return;
      }

      const byText = page
        .locator(':is(a, button, [role="button"], [role="link"])')
        .filter({ hasText: text })
        .first();
      if (await clickIfPresent(byText)) return;
    }
    throw literalError;
  }
}

// Extrae una pista de TEXTO VISIBLE de un selector tipo text= o :has-text().
// Deliberadamente NO deriva texto de name=: un name es un id interno, no texto
// visible; reusarlo como hasText podría hacer click en el elemento equivocado.
function extractTextHint(selector: string): string | null {
  const textEq = selector.match(/^text=["']?(.+?)["']?$/i);
  if (textEq) return textEq[1]!.trim();
  const hasText = selector.match(/has-text\(["'](.+?)["']\)/i);
  if (hasText) return hasText[1]!.trim();
  return null;
}
