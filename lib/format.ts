const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Compact, locale-aware short date, e.g. "16 may". */
export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** Full date with time, e.g. "16 may 2026, 14:32". */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Relative label for recent items, falling back to a short date. */
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < MINUTE) return "hace un momento";
  if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
  if (diff < 7 * DAY) return `hace ${Math.floor(diff / DAY)} d`;
  return formatDateShort(iso);
}

/** Human duration from milliseconds, e.g. "820 ms", "4.2 s", "1m 12s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

/** Duration between two timestamps, or null when either is missing. */
export function formatRunDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return formatDuration(ms);
}
