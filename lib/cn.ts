/**
 * Joins truthy class name fragments into a single string.
 * Intentionally dependency-free: variant maps in this project never produce
 * conflicting Tailwind utilities, so full `tailwind-merge` resolution is not
 * needed.
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
