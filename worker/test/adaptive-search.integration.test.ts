import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  executeSearch,
  findSearchField,
  findSearchSubmit,
} from "../lib/adaptive-search";

/**
 * Tests de integración con un Chromium real (caché local de Playwright) contra
 * fixtures HTML servidas por un servidor HTTP efímero. Cubren los caminos
 * frágiles que la heurística debe acertar: form clásico GET, estado vacío,
 * SPA sin cambio de URL (detección por delta), envío con Enter sin botón, y la
 * trampa de falso positivo (página con contenedores "result/product/item"
 * preexistentes cuya búsqueda no hace nada).
 */

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const q = url.searchParams.get("q");
  res.setHeader("content-type", "text/html; charset=utf-8");

  switch (url.pathname) {
    case "/classic": {
      const form = `<form action="/classic" method="get"><input type="search" name="q" placeholder="Buscar"><button type="submit">Buscar</button></form>`;
      if (q && q.trim()) {
        if (q === "zzz") {
          res.end(page(`${form}<p>No se encontraron resultados</p>`));
        } else {
          res.end(
            page(
              `${form}<ul class="results"><li class="result">A</li><li class="result">B</li><li class="result">C</li></ul>`,
            ),
          );
        }
      } else {
        res.end(page(form));
      }
      return;
    }
    case "/enter": {
      // Sin botón de submit: el envío ocurre con Enter sobre el input.
      const form = `<form action="/enter" method="get"><input type="search" name="q" placeholder="Buscar"></form>`;
      if (q && q.trim()) {
        res.end(page(`${form}<div class="result">R</div>`));
      } else {
        res.end(page(form));
      }
      return;
    }
    case "/spa": {
      res.end(
        page(`
          <nav><ul role="list"><li class="menu-item">Home</li><li class="menu-item">About</li></ul></nav>
          <form id="f"><input type="search" name="q" placeholder="Buscar"><button type="submit">Buscar</button></form>
          <div id="out"></div>
          <script>
            document.getElementById('f').addEventListener('submit', function (e) {
              e.preventDefault();
              document.getElementById('out').innerHTML =
                '<div class="result">R1</div><div class="result">R2</div>';
            });
          </script>`),
      );
      return;
    }
    case "/broken": {
      // Trampa de falso positivo: ya hay nodos "product"/"item"/role=list, pero
      // la búsqueda no cambia URL ni DOM.
      res.end(
        page(`
          <nav><ul role="list"><li class="menu-item">Home</li></ul></nav>
          <div class="product-teaser">Promo</div>
          <form id="f"><input type="search" name="q"><button type="submit">Buscar</button></form>
          <script>
            document.getElementById('f').addEventListener('submit', function (e) { e.preventDefault(); });
          </script>`),
      );
      return;
    }
    case "/no-search": {
      res.end(
        page(
          `<form><input type="password" name="pw"><input type="text" name="city" placeholder="Ciudad"></form>`,
        ),
      );
      return;
    }
    case "/no-button": {
      res.end(page(`<form><input type="search" name="q"></form>`));
      return;
    }
    default:
      res.statusCode = 404;
      res.end(page("not found"));
  }
});

let browser: Browser;
let base: string;
let activePage: Page;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  activePage = await browser.newPage();
});

afterEach(async () => {
  await activePage?.close();
});

describe("findSearchField (browser)", () => {
  it("encuentra el input[type=search]", async () => {
    await activePage.goto(`${base}/classic`);
    const field = await findSearchField(activePage);
    expect(await field.getAttribute("type")).toBe("search");
  });

  it("como último recurso prefiere un input de texto, nunca el password", async () => {
    await activePage.goto(`${base}/no-search`);
    const field = await findSearchField(activePage);
    expect(await field.getAttribute("type")).not.toBe("password");
    expect(await field.getAttribute("name")).toBe("city");
  });
});

describe("findSearchSubmit (browser)", () => {
  it("encuentra el botón de envío cuando existe", async () => {
    await activePage.goto(`${base}/classic`);
    const submit = await findSearchSubmit(activePage);
    expect(submit).not.toBeNull();
    expect((await submit!.textContent())?.trim()).toBe("Buscar");
  });

  it("devuelve null cuando no hay botón", async () => {
    await activePage.goto(`${base}/no-button`);
    expect(await findSearchSubmit(activePage)).toBeNull();
  });
});

describe("executeSearch (browser)", () => {
  it("form clásico GET: éxito con resultados y query en la URL", async () => {
    await activePage.goto(`${base}/classic`);
    const outcome = await executeSearch(activePage, "iphone", 5_000, {
      resultsTimeoutMs: 5_000,
    });
    expect(outcome.success).toBe(true);
    expect(outcome.resultsFound).toBe(true);
    expect(outcome.finalUrl).toContain("q=iphone");
  }, 20_000);

  it("estado vacío: éxito pero resultsFound=false", async () => {
    await activePage.goto(`${base}/classic`);
    const outcome = await executeSearch(activePage, "zzz", 5_000, {
      resultsTimeoutMs: 5_000,
    });
    expect(outcome.success).toBe(true);
    expect(outcome.resultsFound).toBe(false);
  }, 20_000);

  it("SPA sin cambio de URL: éxito por detección de delta", async () => {
    await activePage.goto(`${base}/spa`);
    const outcome = await executeSearch(activePage, "iphone", 5_000, {
      resultsTimeoutMs: 5_000,
    });
    expect(outcome.success).toBe(true);
    expect(outcome.resultsFound).toBe(true);
    expect(outcome.finalUrl).toBe(`${base}/spa`);
  }, 20_000);

  it("sin botón: envía con Enter y detecta resultados", async () => {
    await activePage.goto(`${base}/enter`);
    const outcome = await executeSearch(activePage, "iphone", 5_000, {
      resultsTimeoutMs: 5_000,
    });
    expect(outcome.success).toBe(true);
    expect(outcome.finalUrl).toContain("q=iphone");
  }, 20_000);

  it("búsqueda rota con contenedores preexistentes: NO da falso positivo", async () => {
    await activePage.goto(`${base}/broken`);
    const outcome = await executeSearch(activePage, "iphone", 3_000, {
      resultsTimeoutMs: 1_500,
    });
    expect(outcome.success).toBe(false);
  }, 20_000);
});
