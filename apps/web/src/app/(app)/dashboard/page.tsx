'use client';

import Link from 'next/link';

import { HealthStrip } from '@/components/health-status';
import { OverviewStats } from '@/components/overview-stats';
import { OverviewTable } from '@/components/overview-table';
import { useOverview } from '@/lib/use-insights';

export default function DashboardPage() {
  const overview = useOverview();
  const count = overview.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {overview.isSuccess
              ? `${count} ${count === 1 ? 'website' : 'websites'}, worst health first. Scores update after every scan.`
              : 'Health of your websites, worst first.'}
          </p>
        </div>
        <Link
          href="/dashboard/websites"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4.5 text-sm font-semibold text-primary-foreground transition-colors ease-out hover:bg-primary/90"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            stroke="currentColor"
            strokeWidth={1.8}
            fill="none"
            aria-hidden="true"
          >
            <path d="M7 2v10M2 7h10" />
          </svg>
          Add website
        </Link>
      </header>

      {overview.isPending ? (
        <p className="text-sm text-muted-foreground">Loading websites…</p>
      ) : overview.isError ? (
        <p className="text-sm text-destructive">Could not load the overview.</p>
      ) : (
        <>
          <OverviewStats rows={overview.data} />
          <OverviewTable rows={overview.data} />
        </>
      )}

      <HealthStrip />
    </div>
  );
}
