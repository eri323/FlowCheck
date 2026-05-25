import { describe, expect, it } from "vitest";
import {
  isSearchFillSelector,
  isSearchSubmitSelector,
  looksLikeEmptyState,
  looksLikeSearchSelector,
  urlSignalsSearch,
} from "../lib/adaptive-search";

describe("isSearchFillSelector", () => {
  it("detecta type=search", () => {
    expect(isSearchFillSelector('input[type="search"]')).toBe(true);
    expect(isSearchFillSelector("input[type=search]")).toBe(true);
  });

  it("detecta name=q y name=buscar", () => {
    expect(isSearchFillSelector('input[name="q"]')).toBe(true);
    expect(isSearchFillSelector('input[name="buscar"]')).toBe(true);
    expect(isSearchFillSelector('input[name="busqueda"]')).toBe(true);
    expect(isSearchFillSelector('input[name="query"]')).toBe(true);
    expect(isSearchFillSelector('input[name="keyword"]')).toBe(true);
  });

  it("detecta role=searchbox", () => {
    expect(isSearchFillSelector('[role="searchbox"]')).toBe(true);
    expect(isSearchFillSelector("[role=searchbox]")).toBe(true);
  });

  it("detecta placeholder con términos de búsqueda", () => {
    expect(isSearchFillSelector('input[placeholder="Buscar productos"]')).toBe(
      true,
    );
    expect(isSearchFillSelector('input[placeholder="Search..."]')).toBe(true);
  });

  it("NO detecta type=password, type=email ni name=username", () => {
    expect(isSearchFillSelector('input[type="password"]')).toBe(false);
    expect(isSearchFillSelector('input[type="email"]')).toBe(false);
    expect(isSearchFillSelector('input[name="username"]')).toBe(false);
  });

  it("NO detecta un botón de envío", () => {
    expect(isSearchFillSelector('button[type="submit"]')).toBe(false);
    expect(
      isSearchFillSelector("getByRole('button', { name: 'Buscar' })"),
    ).toBe(false);
  });

  it("NO detecta inputs de texto sin relación con búsqueda", () => {
    expect(isSearchFillSelector('input[name="address"]')).toBe(false);
    expect(isSearchFillSelector('input[name="account"]')).toBe(false);
    expect(isSearchFillSelector("input[type=text]")).toBe(false);
  });
});

describe("isSearchSubmitSelector", () => {
  it("detecta botones de envío genéricos", () => {
    expect(isSearchSubmitSelector('button[type="submit"]')).toBe(true);
    expect(isSearchSubmitSelector('input[type="submit"]')).toBe(true);
  });

  it("detecta botones con verbos de búsqueda", () => {
    expect(
      isSearchSubmitSelector("getByRole('button', { name: 'Buscar' })"),
    ).toBe(true);
    expect(
      isSearchSubmitSelector("getByRole('button', { name: /search/i })"),
    ).toBe(true);
    expect(isSearchSubmitSelector("button.search-btn")).toBe(true);
    expect(isSearchSubmitSelector('button:has-text("Ir")')).toBe(true);
  });

  it("NO detecta el campo de búsqueda", () => {
    expect(isSearchSubmitSelector('input[type="search"]')).toBe(false);
    expect(isSearchSubmitSelector('[role="searchbox"]')).toBe(false);
    expect(isSearchSubmitSelector('input[name="q"]')).toBe(false);
  });

  it("NO detecta selectores vacíos", () => {
    expect(isSearchSubmitSelector("")).toBe(false);
    expect(isSearchSubmitSelector(null)).toBe(false);
    expect(isSearchSubmitSelector(undefined)).toBe(false);
  });
});

describe("looksLikeSearchSelector", () => {
  it("acepta tokens largos de búsqueda como substring", () => {
    expect(looksLikeSearchSelector("#site-search")).toBe(true);
    expect(looksLikeSearchSelector('input[name="query"]')).toBe(true);
    expect(looksLikeSearchSelector('input[name="buscar"]')).toBe(true);
  });

  it("acepta tokens cortos solo con límite de palabra", () => {
    expect(looksLikeSearchSelector('input[name="q"]')).toBe(true);
    expect(looksLikeSearchSelector('input[name="s"]')).toBe(true);
  });

  it("no produce falsos positivos por tokens cortos como substring", () => {
    expect(looksLikeSearchSelector('input[name="account"]')).toBe(false);
    expect(looksLikeSearchSelector('input[name="username"]')).toBe(false);
    expect(looksLikeSearchSelector('input[name="address"]')).toBe(false);
  });

  it("rechaza selectores vacíos o nulos", () => {
    expect(looksLikeSearchSelector("")).toBe(false);
    expect(looksLikeSearchSelector(null)).toBe(false);
    expect(looksLikeSearchSelector(undefined)).toBe(false);
  });
});

describe("urlSignalsSearch", () => {
  it("es falso si la URL no cambió", () => {
    expect(urlSignalsSearch("http://x/a", "http://x/a", "iphone")).toBe(false);
  });

  it("detecta un parámetro de búsqueda conocido con valor", () => {
    expect(urlSignalsSearch("http://x/", "http://x/?q=iphone", "iphone")).toBe(
      true,
    );
    expect(urlSignalsSearch("http://x/", "http://x/s?k=iphone", "iphone")).toBe(
      true,
    );
    expect(urlSignalsSearch("http://x/", "http://x/?search=tv", "tv")).toBe(
      true,
    );
  });

  it("ignora un parámetro de búsqueda vacío", () => {
    expect(urlSignalsSearch("http://x/", "http://x/?q=", "iphone")).toBe(false);
  });

  it("detecta el query reflejado en la ruta", () => {
    expect(
      urlSignalsSearch("http://x/", "http://x/search/iphone", "iphone"),
    ).toBe(true);
  });

  it("detecta un segmento de ruta de búsqueda aunque no haya query", () => {
    expect(urlSignalsSearch("http://x/", "http://x/buscar", "")).toBe(true);
    expect(urlSignalsSearch("http://x/", "http://x/resultados", "")).toBe(true);
  });

  it("es falso ante un cambio de URL sin relación con búsqueda", () => {
    expect(urlSignalsSearch("http://x/", "http://x/login", "x")).toBe(false);
    expect(urlSignalsSearch("http://x/a", "http://x/b?ref=1", "iphone")).toBe(
      false,
    );
  });

  it("es falso ante una URL final inválida", () => {
    expect(urlSignalsSearch("http://x/", "no-es-una-url", "iphone")).toBe(
      false,
    );
  });
});

describe("looksLikeEmptyState", () => {
  it("detecta estados de cero resultados en ES e EN", () => {
    expect(looksLikeEmptyState("No se encontraron resultados")).toBe(true);
    expect(looksLikeEmptyState("Sin resultados")).toBe(true);
    expect(looksLikeEmptyState("0 resultados")).toBe(true);
    expect(looksLikeEmptyState("No encontramos productos")).toBe(true);
    expect(looksLikeEmptyState("No results found")).toBe(true);
    expect(looksLikeEmptyState("Nothing found")).toBe(true);
  });

  it("NO confunde un encabezado de resultados normal con estado vacío", () => {
    expect(looksLikeEmptyState("Resultados de la búsqueda")).toBe(false);
    expect(looksLikeEmptyState("Mostrando 24 productos")).toBe(false);
    expect(looksLikeEmptyState("Tecno results")).toBe(false);
  });

  it("rechaza texto vacío", () => {
    expect(looksLikeEmptyState("")).toBe(false);
  });
});
