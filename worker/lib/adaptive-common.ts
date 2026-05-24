// worker/lib/adaptive-common.ts
import type { Locator, Page } from "playwright-core";

export const VISIBILITY_PROBE_TIMEOUT_MS = 1_000;
export const SETTLE_TIMEOUT_MS = 2_000;
export const OUTCOME_POLL_INTERVAL_MS = 400;
export const OUTCOME_GRACE_MS = 500;

// Texto que delata éxito genérico. \b evita matches embebidos.
export const SUCCESS_TEXT_REGEX =
  /\b(gracias por (tu|su) compra|compra exitosa|operaci[oó]n exitosa|enviad[oa] correctamente|mensaje enviado|fue cread[oa]|cuenta creada|registro exitoso|pedido (realizado|confirmado)|thank you|successfully|success|order .{0,20}?(placed|confirmed|received)|submitted)\b/i;

export const SUBMIT_VERBS = [
  "enviar",
  "submit",
  "guardar",
  "save",
  "continuar",
  "continue",
  "aceptar",
  "confirmar",
  "confirm",
  "send",
];

const SUBMIT_NAME_REGEX = new RegExp(
  `^\\s*(?:${SUBMIT_VERBS.map((v) => v.replace(/\s+/g, "\\s+")).join("|")})\\s*$`,
  "i",
);

export const ERROR_SELECTORS = [
  '[role="alert"]',
  '[role="status"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
  ".error",
  ".alert-danger",
  ".alert-error",
  ".form-error",
  ".field-error",
  ".invalid-feedback",
  '[class*="toast" i]',
  '[class*="snackbar" i]',
  '[class*="notification" i]',
  '[class*="error" i]',
  '[class*="alert" i]',
  '[data-testid*="error" i]',
  '[data-testid*="toast" i]',
];

export async function pickFirstVisible(
  candidates: Locator[],
  label: string,
): Promise<Locator> {
  const found = await pickFirstVisibleOrNull(candidates);
  if (found) return found;
  throw new Error(`No se encontró un ${label} visible mediante detección adaptativa.`);
}

export async function pickFirstVisibleOrNull(
  candidates: Locator[],
): Promise<Locator | null> {
  for (const candidate of candidates) {
    try {
      const count = await candidate.count();
      if (count === 0) continue;
      const first = candidate.first();
      if (await first.isVisible({ timeout: VISIBILITY_PROBE_TIMEOUT_MS })) {
        return first;
      }
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

export async function readVisibleErrorText(page: Page): Promise<string | undefined> {
  for (const selector of ERROR_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    const probeLimit = Math.min(count, 5);
    for (let i = 0; i < probeLimit; i++) {
      const node = locator.nth(i);
      if (!(await node.isVisible().catch(() => false))) continue;
      const text = ((await node.textContent().catch(() => "")) ?? "").trim();
      if (text.length > 0) return text.slice(0, 200);
    }
  }
  const invalid = page.locator('input[aria-invalid="true"]').first();
  if (
    (await invalid.count().catch(() => 0)) > 0 &&
    (await invalid.isVisible().catch(() => false))
  ) {
    return "Un campo del formulario quedó marcado como aria-invalid='true'";
  }
  return undefined;
}

export async function detectNativeValidationBlock(
  page: Page,
): Promise<string | undefined> {
  return page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      if (form.noValidate) continue;
      if (form.checkValidity()) continue;
      for (const control of Array.from(form.elements)) {
        const candidate = control as HTMLInputElement;
        if (
          typeof candidate.checkValidity === "function" &&
          !candidate.checkValidity()
        ) {
          return (
            candidate.validationMessage ||
            "Validación nativa del navegador bloqueó el envío"
          );
        }
      }
    }
    return undefined;
  });
}

export async function isSuccessTextVisible(page: Page): Promise<boolean> {
  const locator = page.getByText(SUCCESS_TEXT_REGEX);
  const count = await locator.count().catch(() => 0);
  const probeLimit = Math.min(count, 5);
  for (let i = 0; i < probeLimit; i++) {
    if (await locator.nth(i).isVisible().catch(() => false)) return true;
  }
  return false;
}

export async function findGenericSubmit(
  page: Page,
  extraVerbs: string[] = [],
): Promise<Locator> {
  const nameRegex =
    extraVerbs.length > 0
      ? new RegExp(
          `^\\s*(?:${[...SUBMIT_VERBS, ...extraVerbs]
            .map((v) => v.replace(/\s+/g, "\\s+"))
            .join("|")})\\s*$`,
          "i",
        )
      : SUBMIT_NAME_REGEX;
  return pickFirstVisible(
    [
      page.locator('button[type="submit"]'),
      page.locator('input[type="submit"]'),
      page.getByRole("button", { name: nameRegex }),
      page.locator(':is(button, a, [role="button"])').filter({ hasText: nameRegex }),
    ],
    "botón de submit",
  );
}
