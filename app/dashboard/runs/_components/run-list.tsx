import Link from "next/link";
import { cn } from "@/lib/cn";
import { TEST_TYPE_LABELS, type TestType } from "@/lib/validation/test-run";
import { formatRelative, formatRunDuration } from "@/lib/format";
import { RunStatusBadge } from "@/components/runs/run-status";
import { ChevronRight } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

/** Shape of a `test_runs` row as selected for list views. */
export type TestRunRow = {
  id: string;
  target_url: string;
  prompt: string | null;
  status: string;
  test_type: TestType;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type RunListItem = {
  id: string;
  target_url: string;
  prompt: string | null;
  status: string;
  test_type: TestType;
  created_at: string;
  createdLabel: string;
  durationLabel: string | null;
};

/** Maps a DB row to a display item, formatting dates on the server. */
export function toRunListItem(row: TestRunRow): RunListItem {
  return {
    id: row.id,
    target_url: row.target_url,
    prompt: row.prompt,
    status: row.status,
    test_type: row.test_type,
    created_at: row.created_at,
    createdLabel: formatRelative(row.created_at),
    durationLabel: formatRunDuration(row.started_at, row.finished_at),
  };
}

/** Responsive grid template; column count matches the visible cells per breakpoint. */
const COLS =
  "grid-cols-[6.25rem_1fr] sm:grid-cols-[6.25rem_6rem_1fr] md:grid-cols-[6.25rem_6rem_1fr_7.5rem] lg:grid-cols-[6.25rem_7rem_1fr_8rem_5.5rem]";

export function RunListHeader(): React.JSX.Element {
  return (
    <div
      className={cn(
        "border-border bg-surface-2 text-faint grid items-center gap-3 border-b px-4 py-2 text-[0.6875rem] font-semibold tracking-[0.07em] uppercase",
        COLS,
      )}
    >
      <span>Estado</span>
      <span className="hidden sm:block">Tipo</span>
      <span>URL / Instrucción</span>
      <span className="hidden md:block">Creado</span>
      <span className="hidden text-right lg:block">Duración</span>
    </div>
  );
}

export function RunRow({ run }: { run: RunListItem }): React.JSX.Element {
  return (
    <Link
      href={`/dashboard/runs/${run.id}`}
      className={cn(
        "group hover:bg-surface-2 grid items-center gap-3 px-4 py-3.5 transition-colors duration-150",
        COLS,
      )}
    >
      <div>
        <RunStatusBadge status={run.status} />
      </div>
      <div className="hidden sm:block">
        <span className="text-muted text-xs">
          {TEST_TYPE_LABELS[run.test_type]}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-text truncate font-mono text-[0.8125rem] font-medium">
            {run.target_url}
          </p>
          {run.prompt ? (
            <p className="text-faint mt-0.5 truncate text-xs">{run.prompt}</p>
          ) : null}
        </div>
        <ChevronRight
          size={14}
          className="text-faint ml-auto shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-60"
        />
      </div>
      <div className="hidden md:block">
        <span className="text-faint text-xs">{run.createdLabel}</span>
      </div>
      <div className="hidden text-right lg:block">
        <span className="tabular text-faint font-mono text-xs">
          {run.durationLabel ?? "—"}
        </span>
      </div>
    </Link>
  );
}

export function RunListSkeleton({
  rows = 6,
}: {
  rows?: number;
}): React.JSX.Element {
  return (
    <div className="border-border bg-surface overflow-hidden rounded-lg border">
      <RunListHeader />
      <div className="divide-border divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn("grid items-center gap-3 px-4 py-3.5", COLS)}
          >
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="hidden h-3.5 w-14 sm:block" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-52 max-w-full" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="hidden h-3 w-16 md:block" />
            <Skeleton className="hidden h-3 w-10 justify-self-end lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
