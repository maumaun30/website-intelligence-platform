import type { OverviewRow } from '@wintel/types';
import Link from 'next/link';

import { ScoreBadge } from '@/components/score-badge';
import { ScoreDelta } from '@/components/score-delta';
import { describeNextScan } from '@/lib/schedule-text';

/** Every date in the product is UTC, and says so, so a viewer never reads it in their own zone. */
const dateTime = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function LastScan({ row }: { row: OverviewRow }) {
  if (row.lastScan === null) {
    return <span className="text-[13px] text-muted-foreground">Not scanned yet</span>;
  }
  if (row.lastScan.status === 'running' || row.lastScan.status === 'queued') {
    return (
      <span className="flex items-center gap-2 text-[13px] font-medium text-primary">
        <span
          aria-hidden="true"
          className="size-1.75 flex-none rounded-full bg-primary ring-3 ring-primary-soft"
        />
        Scanning now
      </span>
    );
  }
  return (
    <span className="text-[13px]">
      {`${dateTime.format(new Date(row.lastScan.createdAt))} UTC`}
      {row.lastScan.trigger === 'scheduled' ? (
        <span className="text-muted-foreground"> · scheduled</span>
      ) : null}
    </span>
  );
}

function Critical({ count }: { count: number | null }) {
  if (count === null) {
    return <span className="text-[13px] text-muted-foreground">—</span>;
  }
  if (count === 0) {
    return <span className="text-[13px] text-muted-foreground">None</span>;
  }
  return (
    <span className="text-[13px] text-destructive-soft-foreground">
      <strong className="tnum font-bold">{count}</strong> critical
    </span>
  );
}

/** Every website in the organization, in the order given (the API sorts worst health first). */
export function OverviewTable({ rows }: { rows: OverviewRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-8 py-10 text-center">
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
          >
            <circle cx="9" cy="9" r="6.5" />
            <path d="M2.5 9h13M9 2.5c2 2 2 11 0 13M9 2.5c-2 2-2 11 0 13" />
          </svg>
        </span>
        <h3 className="text-[17px] font-semibold">No websites yet</h3>
        <p className="max-w-75 text-sm leading-relaxed text-muted-foreground">
          We verify that you own it, crawl it, and give it a health score within a few minutes.
        </p>
        <Link
          href="/dashboard/websites"
          className="mt-1 inline-flex h-10 items-center rounded-md bg-primary px-4.5 text-sm font-semibold text-primary-foreground transition-colors ease-out hover:bg-primary/90"
        >
          Add your first website
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <h2 className="text-[15px] font-semibold">All websites</h2>
        <span className="text-xs text-muted-foreground">
          Sorted by{' '}
          <span className="rounded-sm border border-border px-2 py-1 text-foreground">
            Health · worst first
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-background text-xs font-medium text-muted-foreground">
              <th scope="col" className="px-6 py-3 font-medium">
                Website
              </th>
              <th scope="col" className="w-44 px-3 py-3 font-medium">
                Health
              </th>
              <th scope="col" className="w-24 px-3 py-3 font-medium">
                Change
              </th>
              <th scope="col" className="w-32 px-3 py-3 font-medium">
                Critical
              </th>
              <th scope="col" className="w-52 px-3 py-3 font-medium">
                Last scan
              </th>
              <th scope="col" className="w-44 py-3 pr-6 pl-3 font-medium">
                Next scan
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.websiteId} className="h-16 border-t border-border hover:bg-background">
                <td className="px-6">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-8 flex-none place-items-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground"
                    >
                      {row.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={`/dashboard/websites/${row.websiteId}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {row.domain}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-3">
                  <ScoreBadge score={row.score} />
                </td>
                <td className="px-3">
                  <ScoreDelta delta={row.scoreDelta} />
                </td>
                <td className="px-3">
                  <Critical count={row.criticalCount} />
                </td>
                <td className="px-3">
                  <LastScan row={row} />
                </td>
                <td className="py-0 pr-6 pl-3 text-[13px] text-muted-foreground">
                  {describeNextScan(row.nextScanAt, new Date())}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
