import { Skeleton } from "@/components/ui/skeleton";
import { RunListSkeleton } from "./_components/run-list";

export default function RunsLoading(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Skeleton className="h-9 w-full sm:max-w-xs" />
          <div className="flex gap-2.5">
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
        <RunListSkeleton rows={8} />
      </div>
    </div>
  );
}
