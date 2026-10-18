import { Loading, Skeleton } from "./ui";

/**
 * Shown while the sign-in session and this browser's saved data load. Shapes
 * follow the real shell and overview layout so nothing jumps when they arrive.
 */
export function AppSkeleton() {
  return (
    <Loading label="loading rupert">
      <div className="flex min-h-svh bg-bg">
        <div className="hidden w-[var(--sidebar-w)] shrink-0 flex-col gap-2 border-r border-line bg-surface px-3 pt-6 lg:flex">
          <Skeleton className="mx-3 mb-8 h-7 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="mx-3 h-6 w-36" />
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-[var(--content-max)] flex-col gap-10 px-5 pt-8 sm:px-8 lg:px-12 lg:pt-12">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] lg:gap-10">
            <div className="flex flex-col gap-5 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-7">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-1.5 w-full" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
              <Skeleton className="h-12 w-44" />
            </div>
            <div className="flex flex-col gap-5">
              <Skeleton className="h-6 w-24" />
              <div className="grid grid-cols-2 gap-6">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-12" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-36 w-full rounded-[var(--radius-panel)]" />
            </div>
          </div>
        </div>
      </div>
    </Loading>
  );
}
