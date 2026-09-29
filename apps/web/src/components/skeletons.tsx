import { Skeleton } from '@wintel/ui';

/**
 * Each skeleton mirrors the real component's frame — same card, same row height, same columns —
 * so the swap to real content changes pixels, never layout.
 */

function Card({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-6 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.35fr]">
      {[0, 1, 2].map((index) => (
        <Card key={index}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-24" />
          <Skeleton className="h-4 w-40" />
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card" aria-busy="true">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-16 items-center gap-4 border-t border-border px-6">
          <Skeleton className="size-8 flex-none rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="hidden h-3.5 w-16 md:block" />
          <Skeleton className="hidden h-3.5 w-28 lg:block" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function SectionsSkeleton({ sections = 3, label }: { sections?: number; label: string }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      {Array.from({ length: sections }, (_, index) => (
        <Card key={index} className="gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-64" />
          <Skeleton className="h-10 w-full max-w-sm" />
        </Card>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PlanCardsSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-3" aria-busy="true">
      {[0, 1, 2].map((index) => (
        <Card key={index} className="gap-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-3.5 w-full" />
          {[0, 1, 2, 3].map((line) => (
            <Skeleton key={line} className="h-3.5 w-40" />
          ))}
          <Skeleton className="mt-2 h-10 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function RuleRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex h-14 items-center gap-4 border-t border-border px-6 first:border-t-0"
        >
          <Skeleton className="h-6 w-20 rounded-sm" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
