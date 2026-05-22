// worker/lib/adaptive-registro.ts
import type { Locator, Page } from "playwright-core";
import {
  OUTCOME_GRACE_MS,
  OUTCOME_POLL_INTERVAL_MS,
  SETTLE_TIMEOUT_MS,
  detectNativeValidationBlock,
  findGenericSubmit,
  isSuccessTextVisible,
  pickFirstVisibleOrNull,
  readVisibleErrorText,
} from "./adaptive-common";
import {
  findEmailField,
  findPasswordField,
  looksLikeEmail,
  type LoginOutcome,
} from "./adaptive-login";

const NAME_TOKENS = ["fullname", "full-name", "name", "nombre", "firstname", "first-name", "given-name"];
const CONFIRM_TOKENS = ["confirm", "confirmation", "confirmar", "repeat", "repetir", "again", "verificar", "_2", "retype"];
const REGISTER_VERBS = ["registrar", "registrarme", "regístrate", "registrate", "crear cuenta", "crear", "sign up", "signup", "register", "unirse", "create account"];

const NAME_REGEX = new RegExp(`(${NAME_TOKENS.join("|")})`, "i");
const CONFIRM_REGEX = new RegExp(`(${CONFIRM_TOKENS.join("|")})`, "i");
const REGISTER_REGEX = new RegExp(`(${REGISTER_VERBS.join("|")})`, "i");

export function isNameFillSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("password") || lower.includes("type=email") || lower.includes('type="email"')) {
    return false;
  }
  if (lower.includes("type=password") || lower.includes('type="password"')) return false;
  return NAME_REGEX.test(lower);
}

export function isConfirmPasswordSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  const isPasswordLike =
    lower.includes("password") || lower.includes("contrase") || lower.includes("clave");
  return isPasswordLike && CONFIRM_REGEX.test(lower);
}

export function isRegisterSubmitSelector(selector?: string | null): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=submit") || lower.includes('type="submit"')) return true;
  return REGISTER_REGEX.test(lower);
}

const NAME_LABEL_REGEX = /(nombre|name|full\s*name|first\s*name)/i;

export async function findNameField(page: Page): Promise<Locator | null> {
  return pickFirstVisibleOrNull([
    page.locator('input[autocomplete="name"]'),
    page.locator('input[autocomplete="given-name"]'),
    page.locator('input[name*="fullname" i]'),
    page.locator('input[name*="nombre" i]'),
    page.locator('input[name="name" i]'),
    page.locator('input[name*="firstname" i]'),
    page.locator('input[id*="name" i]:not([type="email"]):not([type="password"])'),
    page.getByLabel(NAME_LABEL_REGEX),
    page.getByPlaceholder(NAME_LABEL_REGEX),
  ]);
}

export async function findConfirmPasswordField(page: Page): Promise<Locator | null> {
  // Estrategia primaria: si hay 2+ inputs password, el segundo es "confirmar".
  const passwords = page.locator('input[type="password"]');
  const count = await passwords.count().catch(() => 0);
  if (count >= 2) {
    const second = passwords.nth(1);
    if (await second.isVisible().catch(() => false)) return second;
  }
  // Secundaria: por tokens de confirmación.
  return pickFirstVisibleOrNull([
    page.locator('input[name*="confirm" i]'),
    page.locator('input[name*="repeat" i]'),
    page.locator('input[name*="repetir" i]'),
    page.getByLabel(/(confirm|repetir|repeat|verificar)/i),
    page.getByPlaceholder(/(confirm|repetir|repeat|verificar)/i),
  ]);
}

export type RegisterOutcome = LoginOutcome;

const OUTCOME_TIMEOUT_DEFAULT_MS = 15_000;
const DUP_EMAIL_REGEX = /(ya (está|esta) (en uso|registrad)|already (taken|registered|in use)|email exists|usuario existente)/i;

export async function registerAndVerify(
  page: Page,
  data: { name: string; email: string; password: string; confirmPassword: string },
  initialUrl: string,
  timeoutMs: number,
): Promise<RegisterOutcome> {
  // Llenar campos disponibles (los ausentes se omiten).
  const nameField = await findNameField(page);
  if (nameField) await nameField.fill(data.name).catch(() => {});

  const emailField = await findEmailField(page);
  if (!looksLikeEmail(data.email)) {
    await emailField.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.type = "text";
      input.removeAttribute("pattern");
      if (input.form) input.form.noValidate = true;
    });
  }
  await emailField.fill(data.email, { timeout: timeoutMs });

  const passwordField = await findPasswordField(page);
  await passwordField.fill(data.password, { timeout: timeoutMs });

  const confirmField = await findConfirmPasswordField(page);
  if (confirmField) await confirmField.fill(data.confirmPassword).catch(() => {});

  const submit = await findGenericSubmit(page, REGISTER_VERBS);
  await submit.click({ timeout: timeoutMs });

  return verifyRegisterOutcome(page, initialUrl);
}

async function verifyRegisterOutcome(
  page: Page,
  initialUrl: string,
): Promise<RegisterOutcome> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {});

  const deadline = Date.now() + OUTCOME_TIMEOUT_DEFAULT_MS;
  while (Date.now() < deadline) {
    const currentUrl = page.url();
    if (currentUrl !== initialUrl) {
      await page.waitForTimeout(OUTCOME_GRACE_MS);
      return {
        success: true,
        finalUrl: page.url(),
        initialUrl,
        reason: `La URL cambió de ${initialUrl} a ${page.url()} — registro aceptado.`,
      };
    }
    const errorText = await readVisibleErrorText(page);
    if (errorText) {
      const dup = DUP_EMAIL_REGEX.test(errorText);
      return {
        success: false,
        finalUrl: currentUrl,
        initialUrl,
        reason: dup
          ? `El email ya está en uso: "${errorText}"`
          : `Error visible tras el registro: "${errorText}"`,
        errorText,
      };
    }
    const nativeBlock = await detectNativeValidationBlock(page);
    if (nativeBlock) {
      return {
        success: false,
        finalUrl: page.url(),
        initialUrl,
        reason: `Validación nativa bloqueó el registro: "${nativeBlock}"`,
        errorText: nativeBlock,
      };
    }
    if (await isSuccessTextVisible(page)) {
      await page.waitForTimeout(OUTCOME_GRACE_MS);
      return {
        success: true,
        finalUrl: page.url(),
        initialUrl,
        reason: "Apareció un mensaje de éxito tras el registro.",
      };
    }
    await page.waitForTimeout(OUTCOME_POLL_INTERVAL_MS);
  }

  return {
    success: false,
    finalUrl: page.url(),
    initialUrl,
    reason:
      "Tras enviar el registro no hubo cambio de URL, ni mensaje de éxito, ni error " +
      "visible. Causas probables: validación silenciosa, redirect lento o selector " +
      "de submit erróneo. Revisa el screenshot.",
  };
}
