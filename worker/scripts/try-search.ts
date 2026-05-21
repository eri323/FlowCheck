/**
 * Validación manual de la heurística de búsqueda contra un sitio real.
 *
 * Uso:
 *   npx tsx scripts/try-search.ts <url> <query...>
 *
 * Ejemplos:
 *   npx tsx scripts/try-search.ts https://es.wikipedia.org camiseta
 *   npx tsx scripts/try-search.ts https://developer.mozilla.org "array map"
 *
 * Por defecto abre el navegador (headed) para que veas el flujo y lo deja
 * abierto hasta Ctrl+C. Para correr sin ventana y que cierre solo:
 *   HEADLESS=1 npx tsx scripts/try-search.ts <url> <query>
 *
 * Nota: usa el Chromium de la caché local de Playwright (NO el binario de
 * @sparticuz/chromium, que es para Render/Linux).
 */
import { chromium } from "playwright-core";
import { executeSearch } from "../lib/adaptive-search";

async function main(): Promise<void> {
  const url = process.argv[2];
  const query = process.argv.slice(3).join(" ").trim() || "camiseta";

  if (!url) {
    console.error("Uso: npx tsx scripts/try-search.ts <url> <query...>");
    process.exit(1);
  }

  const headless = process.env.HEADLESS === "1";
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  try {
    console.log(`→ goto ${url}`);
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });

    console.log(`→ ejecutando búsqueda: "${query}"`);
    const startedAt = Date.now();
    const outcome = await executeSearch(page, query, 15_000);
    const ms = Date.now() - startedAt;

    console.log("\n=== SearchOutcome ===");
    console.log(`success      : ${outcome.success}`);
    console.log(`resultsFound : ${outcome.resultsFound}`);
    console.log(`finalUrl     : ${outcome.finalUrl}`);
    console.log(`reason       : ${outcome.reason ?? "—"}`);
    console.log(`tiempo       : ${ms}ms`);
  } catch (error) {
    console.error("\nERROR:", error instanceof Error ? error.message : error);
  } finally {
    if (headless) {
      await browser.close();
    } else {
      console.log("\n(navegador abierto para inspección — Ctrl+C para cerrar)");
      await new Promise<never>(() => {});
    }
  }
}

void main();
