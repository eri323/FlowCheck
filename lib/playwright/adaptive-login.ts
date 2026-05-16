import type { Locator, Page } from "playwright";

const SUBMIT_KEYWORDS = [
  "ingresar",
  "entrar",
  "acceder",
  "iniciar sesión",
  "iniciar sesion",
  "iniciar",
  "login",
  "log in",
  "sign in",
  "signin",
  "enviar",
  "continuar",
  "submit",
];

const SUBMIT_NAME_REGEX = new RegExp(
  `^\\s*(?:${SUBMIT_KEYWORDS.map((kw) => kw.replace(/\s+/g, "\\s+")).join("|")})\\s*$`,
  "i",
);

const ERROR_SELECTORS = [
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

const OUTCOME_TIMEOUT_MS = 30_000;
const OUTCOME_POLL_INTERVAL_MS = 400;
const OUTCOME_GRACE_MS = 500;
const SETTLE_TIMEOUT_MS = 2_000;
const VISIBILITY_PROBE_TIMEOUT_MS = 1_000;

// Términos largos: seguros como substring en name/id/placeholder.
const IDENTIFIER_LONG_TOKENS = [
  "email",
  "correo",
  "usuario",
  "username",
  "user",
  "mail",
  "login",
  "cedula",
  "documento",
  "identificacion",
];

// Términos cortos y ambiguos: solo con límite de palabra o atributo exacto.
const IDENTIFIER_SHORT_TOKENS = ["cc", "dni", "nit", "rut"];

const IDENTIFIER_SELECTOR_REGEX = new RegExp(
  `(${IDENTIFIER_LONG_TOKENS.join("|")}|\\b(?:${IDENTIFIER_SHORT_TOKENS.join("|")})\\b)`,
  "i",
);

const PASSWORD_KEYWORDS = [
  "password",
  "contraseña",
  "contrasena",
  "clave",
  "pwd",
  "pass",
];

const EMAIL_LABEL_REGEX =
  /(email|correo|usuario|user(name)?|mail|login|c[eé]dula|documento|identificaci[oó]n|n[uú]mero de documento|\bcc\b|\bdni\b|\bnit\b|\brut\b)/i;
const PASSWORD_LABEL_REGEX = /(password|contrase(ñ|n)a|clave|pwd|pass)/i;

export type LoginOutcome = {
  success: boolean;
  finalUrl: string;
  initialUrl: string;
  reason: string;
  errorText?: string;
};

export function isLoginSubmitSelector(selector: string | null | undefined): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=submit") || lower.includes('type="submit"')) return true;
  return SUBMIT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isPasswordFillSelector(selector: string | null | undefined): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=password") || lower.includes('type="password"')) {
    return true;
  }
  return PASSWORD_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isEmailFillSelector(selector: string | null | undefined): boolean {
  if (!selector) return false;
  if (isPasswordFillSelector(selector)) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=email") || lower.includes('type="email"')) return true;
  return IDENTIFIER_SELECTOR_REGEX.test(lower);
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function fillIdentifierField(
  page: Page,
  value: string,
  timeoutMs: number,
): Promise<{ relaxed: boolean }> {
  const field = await findEmailField(page);
  const relaxed = !looksLikeEmail(value);

  if (relaxed) {
    // El valor no parece email: si el campo es <input type="email">, el
    // navegador bloquearía el submit por validación de restricciones HTML5.
    // Desactivamos esa validación SOLO del lado del cliente.
    await field.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.type = "text";
      input.removeAttribute("pattern");
      const form = input.form;
      if (form) form.noValidate = true;
    });
  }

  await field.fill(value, { timeout: timeoutMs });
  return { relaxed };
}

async function pickFirstVisible(
  candidates: Locator[],
  label: string,
): Promise<Locator> {
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
  throw new Error(
    `No se encontró un ${label} visible mediante detección adaptativa.`,
  );
}

export async function findEmailField(page: Page): Promise<Locator> {
  return pickFirstVisible(
    [
      page.locator('input[type="email"]'),
      page.locator('input[autocomplete="email"]'),
      page.locator('input[autocomplete="username"]'),
      page.locator('input[name*="email" i]'),
      page.locator('input[name*="usuario" i]'),
      page.locator('input[name*="user" i]'),
      page.locator('input[name*="correo" i]'),
      page.locator('input[name*="login" i]'),
      page.locator('input[id*="email" i]'),
      page.locator('input[id*="user" i]'),
      page.locator('input[name*="cedula" i]'),
      page.locator('input[name*="documento" i]'),
      page.locator('input[name*="identificacion" i]'),
      page.locator('input[id*="cedula" i]'),
      page.locator('input[id*="documento" i]'),
      page.locator('input[id*="identificacion" i]'),
      page.locator('input[name="cc" i]'),
      page.locator('input[name="dni" i]'),
      page.locator('input[name="nit" i]'),
      page.locator('input[name="rut" i]'),
      page.locator('input[id="cc" i]'),
      page.locator('input[id="dni" i]'),
      page.locator('input[id="nit" i]'),
      page.locator('input[id="rut" i]'),
      page.getByLabel(EMAIL_LABEL_REGEX),
      page.getByPlaceholder(EMAIL_LABEL_REGEX),
      page.locator(
        'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])',
      ),
    ],
    "campo de email/usuario",
  );
}

export async function findPasswordField(page: Page): Promise<Locator> {
  return pickFirstVisible(
    [
      page.locator('input[type="password"]'),
      page.locator('input[autocomplete="current-password"]'),
      page.locator('input[autocomplete="new-password"]'),
      page.locator('input[name*="password" i]'),
      page.locator('input[name*="contrase" i]'),
      page.locator('input[name*="clave" i]'),
      page.locator('input[id*="password" i]'),
      page.locator('input[id*="contrase" i]'),
      page.getByLabel(PASSWORD_LABEL_REGEX),
      page.getByPlaceholder(PASSWORD_LABEL_REGEX),
    ],
    "campo de contraseña",
  );
}

export async function findSubmitButton(page: Page): Promise<Locator> {
  return pickFirstVisible(
    [
      page.locator('button[type="submit"]'),
      page.locator('input[type="submit"]'),
      page.getByRole("button", { name: SUBMIT_NAME_REGEX }),
      page
        .locator(':is(button, a, [role="button"])')
        .filter({ hasText: SUBMIT_NAME_REGEX }),
    ],
    `botón de submit (probé type=submit y textos: ${SUBMIT_KEYWORDS.join(", ")})`,
  );
}

async function readVisibleErrorText(page: Page): Promise<string | undefined> {
  for (const selector of ERROR_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    const probeLimit = Math.min(count, 5);
    for (let i = 0; i < probeLimit; i++) {
      const node = locator.nth(i);
      const visible = await node.isVisible().catch(() => false);
      if (!visible) continue;
      const text = (await node.textContent().catch(() => "")) ?? "";
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        return trimmed.slice(0, 200);
      }
    }
  }

  const invalid = page.locator('input[aria-invalid="true"]').first();
  const invalidCount = await invalid.count().catch(() => 0);
  if (invalidCount > 0 && (await invalid.isVisible().catch(() => false))) {
    return "Un campo del formulario quedó marcado como aria-invalid='true'";
  }

  return undefined;
}

async function isPasswordVisible(page: Page): Promise<boolean> {
  return page
    .locator('input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
}

async function detectNativeValidationBlock(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    // Preferimos el <form> que contiene el campo de contraseña (el form de
    // login); si no se identifica, caemos a revisar todos los forms. Así un
    // form ajeno inválido (buscador, newsletter) no genera un diagnóstico falso.
    const passwordInput = document.querySelector('input[type="password"]');
    const loginForm =
      passwordInput instanceof HTMLInputElement ? passwordInput.form : null;
    const forms = loginForm
      ? [loginForm]
      : Array.from(document.querySelectorAll("form"));
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

export async function verifyLoginOutcome(
  page: Page,
  initialUrl: string,
): Promise<LoginOutcome> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {
      // si la página ya está estable o tarda más, seguimos con el polling
    });

  const deadline = Date.now() + OUTCOME_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    if (currentUrl !== initialUrl) {
      await page.waitForTimeout(OUTCOME_GRACE_MS);
      const finalUrl = page.url();
      return {
        success: true,
        finalUrl,
        initialUrl,
        reason: `La URL cambió de ${initialUrl} a ${finalUrl}`,
      };
    }

    const errorText = await readVisibleErrorText(page);
    if (errorText) {
      return {
        success: false,
        finalUrl: currentUrl,
        initialUrl,
        reason: `Mensaje de error visible tras el submit: "${errorText}"`,
        errorText,
      };
    }

    const nativeBlock = await detectNativeValidationBlock(page);
    if (nativeBlock) {
      return {
        success: false,
        finalUrl: page.url(),
        initialUrl,
        reason:
          `El navegador bloqueó el envío del formulario por validación nativa: ` +
          `"${nativeBlock}". Si esta app loguea por documento o usuario, ese ` +
          `campo está marcado como type=email por error.`,
        errorText: nativeBlock,
      };
    }

    if (!(await isPasswordVisible(page))) {
      await page.waitForTimeout(OUTCOME_GRACE_MS);
      return {
        success: true,
        finalUrl: page.url(),
        initialUrl,
        reason: "El campo de contraseña desapareció — el formulario fue aceptado",
      };
    }

    await page.waitForTimeout(OUTCOME_POLL_INTERVAL_MS);
  }

  const finalUrl = page.url();
  const seconds = Math.round(OUTCOME_TIMEOUT_MS / 1000);
  return {
    success: false,
    finalUrl,
    initialUrl,
    reason:
      `Tras esperar ${seconds}s no hubo cambio de URL (sigue en ${finalUrl}), ` +
      `el campo de contraseña sigue visible y no se detectó ningún mensaje de error. ` +
      "Causas probables: (1) credenciales inválidas y la app no muestra error visible, " +
      "(2) el error se renderiza en un selector poco común no cubierto por la heurística, " +
      "o (3) el redirect del SPA es más lento que el timeout. Revisa el screenshot del paso.",
  };
}
