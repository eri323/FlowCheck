import sparticuz from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";

/**
 * Lanza Chromium con el binario recortado de @sparticuz/chromium y sus
 * flags de bajo consumo (--single-process, --no-zygote, sin GPU), para
 * caber en los 512 MB de RAM del free tier de Render.
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    args: sparticuz.args,
    executablePath: await sparticuz.executablePath(),
    headless: true,
  });
}
