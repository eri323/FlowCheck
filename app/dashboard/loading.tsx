import { Skeleton } from "@/components/ui/skeleton";
import { RunListSkeleton } from "./runs/_components/run-list";

export default function DashboardLoading(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface px-4 py-3.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-2 h-7 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-36" />
        <RunListSkeleton rows={6} />
      </div>
    </div>
  );
}
