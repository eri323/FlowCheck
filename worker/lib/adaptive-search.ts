import type { Locator, Page } from "playwright-core";

// Términos largos: seguros como substring en name/id/placeholder/role.
// "search" cubre también type="search" y role="searchbox".
const SEARCH_LONG_TOKENS = [
  "search",
  "query",
  "buscar",
  "busqueda",
  "búsqueda",
  "keyword",
  "termino",
  "término",
];

// Términos cortos y ambiguos: solo con límite de palabra o atributo exacto.
// "q" (Google, etc.) y "s" (WordPress) son nombres clásicos del buscador.
const SEARCH_SHORT_TOKENS = ["q", "s"];

const SEARCH_TOKEN_REGEX = new RegExp(
  `(${SEARCH_LONG_TOKENS.join("|")}|\\b(?:${SEARCH_SHORT_TOKENS.join("|")})\\b)`,
  "i",
);

// Verbos de envío del buscador. Largos como substring; cortos con límite.
const SEARCH_SUBMIT_LONG_TOKENS = ["buscar", "search"];
const SEARCH_SUBMIT_SHORT_TOKENS = ["go", "ir"];

const SEARCH_SUBMIT_TOKEN_REGEX = new RegExp(
  `(${SEARCH_SUBMIT_LONG_TOKENS.join("|")}|\\b(?:${SEARCH_SUBMIT_SHORT_TOKENS.join("|")})\\b)`,
  "i",
);

const SEARCH_SUBMIT_NAME_REGEX = /buscar|search|\bgo\b|\bir\b/i;

const SEARCH_PLACEHOLDER_REGEX =
  /buscar|search|¿qué buscas|qué estás buscando|que estas buscando/i;

// Parámetros de query string que casi siempre indican una búsqueda.
const KNOWN_SEARCH_PARAMS = [
  "q",
  "query",
  "search",
  "s",
  "keyword",
  "term",
  "k",
  "wd",
];

// Segmentos de ruta típicos de una página de resultados.
const SEARCH_PATH_REGEX =
  /\/(search|buscar|busqueda|b[uú]squeda|results?|resultados?)\b/i;

// Texto que delata un estado de "cero resultados". `\bno` evita que un "no
// results" embebido en otra palabra (p. ej. "Tecno results") dispare el match.
const EMPTY_STATE_REGEX =
  /\bno\s+(se\s+)?(encontr|hay|existen|result|coincid|pudimos)|\bsin\s+resultados|\b0\s+resultados|\bno\s+results?\b|\bno\s+matches\b|did\s*n.?t\s+match|nothing\s+found|nada\s+que\s+mostrar|\bno\s+products?\s+found/i;

// Contenedores candidatos a "resultado". Solo se usan para detección por DELTA
// (aparición de nodos nuevos tras enviar), nunca por presencia estática: muchos
// sitios ya tienen nodos "item/list/product" en nav/footer antes de buscar.
const RESULT_CANDIDATE_SELECTOR = [
  '[data-testid*="result" i]',
  '[class*="result" i]',
  '[class*="product" i]',
  '[role="grid"] [role="gridcell"]',
  '[role="list"] [role="listitem"]',
  'li[class*="item" i]',
  '[class*="card" i]',
].join(",");

const SEARCH_TIMEOUT_MS = 10_000;
const SEARCH_POLL_INTERVAL_MS = 400;
const SEARCH_GRACE_MS = 500;
const SETTLE_TIMEOUT_MS = 2_000;
const VISIBILITY_PROBE_TIMEOUT_MS = 1_000;

export type SearchOutcome = {
  /** La búsqueda se ejecutó y se detectó que la app reaccionó (página de
   * resultados, delta de DOM o transición de SPA). */
  success: boolean;
  /** Se confirmó la presencia de resultados reales (distinto de un estado de
   * cero resultados o de una transición sin contenido confirmable). */
  resultsFound: boolean;
  finalUrl: string;
  reason?: string;
};

function looksLikePasswordOrEmail(lower: string): boolean {
  return (
    lower.includes("type=password") ||
    lower.includes('type="password"') ||
    lower.includes("type=email") ||
    lower.includes('type="email"')
  );
}

function looksLikeButtonSelector(lower: string): boolean {
  return (
    lower.includes("button") ||
    lower.includes("type=submit") ||
    lower.includes('type="submit"') ||
    lower.includes("role=button") ||
    lower.includes('role="button"')
  );
}

/** Detecta si un selector referencia términos de un campo de búsqueda. */
export function looksLikeSearchSelector(
  selector: string | null | undefined,
): boolean {
  if (!selector) return false;
  return SEARCH_TOKEN_REGEX.test(selector.toLowerCase());
}

/** ¿El selector de Gemini apunta al input del buscador? */
export function isSearchFillSelector(
  selector: string | null | undefined,
): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  // Un campo de búsqueda no es un password, email ni un botón de envío.
  if (looksLikePasswordOrEmail(lower)) return false;
  if (looksLikeButtonSelector(lower)) return false;
  return looksLikeSearchSelector(lower);
}

/** ¿El selector de Gemini apunta al botón de envío del buscador? */
export function isSearchSubmitSelector(
  selector: string | null | undefined,
): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  if (lower.includes("type=submit") || lower.includes('type="submit"')) {
    return true;
  }
  // Un campo de búsqueda no es un botón de envío.
  if (lower.includes("type=search") || lower.includes('type="search"')) {
    return false;
  }
  if (lower.includes("role=searchbox") || lower.includes('role="searchbox"')) {
    return false;
  }
  return SEARCH_SUBMIT_TOKEN_REGEX.test(lower);
}

/**
 * Señal FUERTE de que la URL final corresponde a una página de búsqueda: la URL
 * cambió y además (a) trae un parámetro de búsqueda conocido con valor, (b)
 * refleja el query en la propia URL, o (c) cae en una ruta de resultados. Un
 * simple cambio de URL no basta (podría ser un redirect a login, etc.).
 */
export function urlSignalsSearch(
  initialUrl: string,
  finalUrl: string,
  query: string,
): boolean {
  if (!finalUrl || finalUrl === initialUrl) return false;

  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return false;
  }

  for (const param of KNOWN_SEARCH_PARAMS) {
    const value = parsed.searchParams.get(param);
    if (value && value.trim().length > 0) return true;
  }

  const q = (query ?? "").trim();
  if (q.length >= 2) {
    let decoded = finalUrl;
    try {
      decoded = decodeURIComponent(finalUrl);
    } catch {
      // mantenemos la URL cruda si no se puede decodificar
    }
    if (decoded.toLowerCase().includes(q.toLowerCase())) return true;
  }

  return SEARCH_PATH_REGEX.test(parsed.pathname);
}

/** ¿El texto delata un estado de cero resultados? */
export function looksLikeEmptyState(text: string | null | undefined): boolean {
  if (!text) return false;
  return EMPTY_STATE_REGEX.test(text);
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

export async function findSearchField(page: Page): Promise<Locator> {
  return pickFirstVisible(
    [
      page.locator('input[type="search"]'),
      page.locator('input[name="q" i]'),
      page.locator('input[name="query" i]'),
      page.locator('input[name*="search" i]'),
      page.locator('input[name*="buscar" i]'),
      page.locator('input[name*="busqueda" i]'),
      page.locator('input[name*="keyword" i]'),
      page.locator('input[name*="termino" i]'),
      page.locator('input[name="s" i]'),
      page.locator('[role="searchbox"]'),
      page.locator('[role="search"] input:not([type="hidden"])'),
      page.locator('input[autocomplete="off"][type="search"]'),
      page.getByPlaceholder(SEARCH_PLACEHOLDER_REGEX),
      page.locator(
        'input:not([type="password"]):not([type="email"]):not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="button"])',
      ),
    ],
    "campo de búsqueda",
  );
}

export async function findSearchSubmit(page: Page): Promise<Locator | null> {
  const candidates = [
    page.locator('[role="search"] button[type="submit"]'),
    page.locator('button[type="submit"]'),
    page.getByRole("button", { name: SEARCH_SUBMIT_NAME_REGEX }),
    page.locator('input[type="submit"]'),
    page.locator('[role="search"] button'),
  ];

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

  // No hay botón visible: la búsqueda probablemente se dispara con Enter.
  return null;
}

async function countResultCandidates(page: Page): Promise<number> {
  return page
    .locator(RESULT_CANDIDATE_SELECTOR)
    .count()
    .catch(() => 0);
}

async function isEmptyStateVisible(page: Page): Promise<boolean> {
  const locator = page.getByText(EMPTY_STATE_REGEX);
  const count = await locator.count().catch(() => 0);
  const probeLimit = Math.min(count, 5);
  for (let i = 0; i < probeLimit; i++) {
    if (
      await locator
        .nth(i)
        .isVisible()
        .catch(() => false)
    ) {
      return true;
    }
  }
  return false;
}

export async function executeSearch(
  page: Page,
  query: string,
  timeoutMs: number,
  opts: { resultsTimeoutMs?: number } = {},
): Promise<SearchOutcome> {
  const resultsBudget = opts.resultsTimeoutMs ?? SEARCH_TIMEOUT_MS;
  const initialUrl = page.url();

  let field: Locator;
  try {
    field = await findSearchField(page);
  } catch (error) {
    return {
      success: false,
      resultsFound: false,
      finalUrl: page.url(),
      reason:
        error instanceof Error
          ? error.message
          : "No se encontró el campo de búsqueda mediante detección adaptativa.",
    };
  }

  // Evitamos re-escribir si el valor ya está puesto: re-llenar dispara de nuevo
  // los dropdowns de autocompletado y puede interceptar el Enter.
  const currentValue = await field.inputValue().catch(() => "");
  if (currentValue !== query) {
    await field.fill(query, { timeout: timeoutMs });
  }

  // Baseline de candidatos a resultado ANTES de enviar — base de la detección
  // por delta (neutraliza los nodos "item/product" preexistentes).
  const baseline = await countResultCandidates(page);

  // Enviar: preferimos el botón (más fiable que Enter ante typeahead). Si no
  // hay, Enter sobre el campo enfocado.
  const submit = await findSearchSubmit(page);
  if (submit) {
    await submit.click({ timeout: timeoutMs });
  } else {
    await field.press("Enter", { timeout: timeoutMs });
  }

  await page
    .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => {
      // si la página ya está estable o tarda más, seguimos con el polling
    });

  const deadline = Date.now() + resultsBudget;

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const urlSignal = urlSignalsSearch(initialUrl, currentUrl, query);

    let deltaIncreased = false;
    let fieldGone = false;
    if (!urlSignal) {
      const count = await countResultCandidates(page);
      deltaIncreased = count > baseline;
      if (!deltaIncreased) {
        // Si el locator está separado del DOM por navegación, isVisible lanza;
        // asumimos "visible" para no marcar SPA por un error transitorio.
        fieldGone = !(await field.isVisible().catch(() => true));
      }
    }

    if (urlSignal || deltaIncreased || fieldGone) {
      await page.waitForTimeout(SEARCH_GRACE_MS);
      const finalUrl = page.url();
      const empty = await isEmptyStateVisible(page);
      const confirmed =
        urlSignalsSearch(initialUrl, finalUrl, query) || deltaIncreased;
      const resultsFound = !empty && confirmed;
      return {
        success: true,
        resultsFound,
        finalUrl,
        reason: empty
          ? "La búsqueda se ejecutó pero la app reportó cero resultados."
          : resultsFound
            ? "Búsqueda ejecutada y resultados detectados."
            : "La app transicionó tras la búsqueda, pero no se pudo confirmar el contenido de resultados.",
      };
    }

    await page.waitForTimeout(SEARCH_POLL_INTERVAL_MS);
  }

  const finalUrl = page.url();
  const seconds = Math.round(resultsBudget / 1000);
  return {
    success: false,
    resultsFound: false,
    finalUrl,
    reason:
      `Tras esperar ${seconds}s la búsqueda no produjo ninguna señal: la URL no ` +
      `cambió a una página de resultados (sigue en ${finalUrl}), no aparecieron ` +
      "nodos de resultado nuevos y el campo de búsqueda sigue presente. Causas " +
      "probables: (1) el envío no disparó la búsqueda (selector de submit erróneo " +
      "o intercepción de typeahead), (2) los resultados se renderizan de una forma " +
      "no cubierta por la heurística, o (3) la app no reaccionó. Revisa el screenshot.",
  };
}
