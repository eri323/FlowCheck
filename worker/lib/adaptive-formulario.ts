// worker/lib/adaptive-formulario.ts
import type { Locator, Page } from "playwright-core";
import {
  SETTLE_TIMEOUT_MS,
  SUBMIT_VERBS,
  detectNativeValidationBlock,
  findGenericSubmit,
  isSuccessTextVisible,
  pickFirstVisibleOrNull,
  readVisibleErrorText,
} from "./adaptive-common";

export type FieldPair = { label: string; value: string };

export function parseFields(raw: string): FieldPair[] {
  const out: FieldPair[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([^:=]+)[:=](.*)$/);
    if (!m) continue;
    const label = m[1]!.trim();
    const value = m[2]!.trim();
    if (label.length === 0) continue;
    out.push({ label, value });
  }
  return out;
}

const TRUE_TOKENS = new Set(["sí", "si", "true", "x", "yes", "on", "1", "checked"]);
const FALSE_TOKENS = new Set(["no", "false", "off", "0", "unchecked"]);

export function asBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (TRUE_TOKENS.has(v)) return true;
  if (FALSE_TOKENS.has(v)) return false;
  return null;
}

const SUBMIT_TOKEN_REGEX = new RegExp(`(${SUBMIT_VERBS.join("|")})`, "i");

export function isFormSubmitSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=submit") || lower.includes('type="submit"')) return true;
  if (lower.includes("type=text") || lower.includes('type="text"')) return false;
  if (lower.startsWith("input[name")) return false;
  return SUBMIT_TOKEN_REGEX.test(lower);
}

function slug(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "");
}

export async function resolveField(
  page: Page,
  label: string,
): Promise<Locator | null> {
  const escaped = label.replace(/["\\]/g, "\\$&");
  const s = slug(label);
  return pickFirstVisibleOrNull([
    page.getByLabel(new RegExp(escaped, "i")),
    page.getByPlaceholder(new RegExp(escaped, "i")),
    page.locator(`[aria-label*="${escaped}" i]`),
    page.locator(`input[name*="${s}" i], textarea[name*="${s}" i], select[name*="${s}" i]`),
    page.locator(`input[id*="${s}" i], textarea[id*="${s}" i], select[id*="${s}" i]`),
  ]);
}

export async function fillField(control: Locator, value: string): Promise<void> {
  const tag = (await control.evaluate((el) => el.tagName.toLowerCase())).trim();
  if (tag === "select") {
    await control.selectOption({ label: value }).catch(async () => {
      await control.selectOption(value);
    });
    return;
  }
  const type = ((await control.getAttribute("type")) ?? "").toLowerCase();
  if (type === "checkbox" || type === "radio") {
    const bool = asBoolean(value);
    if (bool === false) await control.uncheck().catch(() => {});
    else await control.check();
    return;
  }
  await control.fill(value);
}

const FORM_POLL_INTERVAL_MS = 300;
const FORM_RESULTS_TIMEOUT_MS = 8_000;

export type FormOutcome = { success: boolean; finalUrl: string; reason: string };

export async function fillAndSubmitForm(
  page: Page,
  fields: FieldPair[],
  timeoutMs: number,
  opts: { resultsTimeoutMs?: number } = {},
): Promise<FormOutcome> {
  const initialUrl = page.url();
  let filled = 0;
  for (const { label, value } of fields) {
    const control = await resolveField(page, label);
    if (!control) continue;
    try {
      await fillField(control, value);
      filled += 1;
    } catch {
      // campo no llenable; el árbitro sigue siendo la verificación
    }
  }
  if (filled === 0) {
    return {
      success: false,
      finalUrl: page.url(),
      reason: "No se pudo resolver ningún campo del formulario por su etiqueta.",
    };
  }

  let submit: Locator;
  try {
    submit = await findGenericSubmit(page);
  } catch {
    return {
      success: false,
      finalUrl: page.url(),
      reason: "No se encontró un botón de envío del formulario.",
    };
  }
  await submit.click({ timeout: timeoutMs });

  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});

  const deadline = Date.now() + (opts.resultsTimeoutMs ?? FORM_RESULTS_TIMEOUT_MS);
  while (Date.now() < deadline) {
    // Fallo inmediato si hay error visible o bloqueo de validación nativa.
    const errorText = await readVisibleErrorText(page);
    if (errorText) {
      return {
        success: false,
        finalUrl: page.url(),
        reason: `Error visible tras enviar: "${errorText}"`,
      };
    }
    const nativeBlock = await detectNativeValidationBlock(page);
    if (nativeBlock) {
      return {
        success: false,
        finalUrl: page.url(),
        reason: `Validación nativa bloqueó el envío: "${nativeBlock}"`,
      };
    }
    // Éxito por comportamiento: URL cambió, mensaje de éxito, o form desapareció.
    if (page.url() !== initialUrl) {
      return { success: true, finalUrl: page.url(), reason: "La URL cambió tras enviar." };
    }
    if (await isSuccessTextVisible(page)) {
      return {
        success: true,
        finalUrl: page.url(),
        reason: "Apareció un mensaje de éxito tras enviar.",
      };
    }
    const formGone = (await page.locator("form").count().catch(() => 0)) === 0;
    if (formGone) {
      return {
        success: true,
        finalUrl: page.url(),
        reason: "El formulario desapareció tras enviar.",
      };
    }
    await page.waitForTimeout(FORM_POLL_INTERVAL_MS);
  }

  return {
    success: false,
    finalUrl: page.url(),
    reason:
      "Tras enviar no hubo ninguna señal de éxito: la URL no cambió, no apareció " +
      "mensaje de éxito ni desapareció el formulario, y no se detectó error visible. " +
      "Revisa el screenshot.",
  };
}
