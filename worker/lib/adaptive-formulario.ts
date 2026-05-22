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
