'use client';

import Link from 'next/link';

import { describeNextScan } from '@/lib/schedule-text';
import { useWebsites } from '@/lib/use-websites';

const STATUS_PILL = {
  verified: 'bg-success-soft text-success-soft-foreground',
  pending: 'bg-warning-soft text-warning-soft-foreground',
  failed: 'bg-destructive-soft text-destructive-soft-foreground',
} as const;

/** The websites of this organization, with the verification state the overview leaves out. */
export function WebsitesList() {
  const { data, isPending, isError } = useWebsites();

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading websites…</p>;
  }

  if (isError) {
    return <p className="text-sm text-destructive">Could not load websites.</p>;
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">No websites yet. Add your first below.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-background text-xs font-medium text-muted-foreground">
            <th scope="col" className="px-6 py-3 font-medium">
              Website
            </th>
            <th scope="col" className="w-36 px-3 py-3 font-medium">
              Verification
            </th>
            <th scope="col" className="w-52 py-3 pr-6 pl-3 font-medium">
              Next scan
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((website) => (
            <tr key={website.id} className="h-16 border-t border-border hover:bg-background">
              <td className="px-6">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-8 flex-none place-items-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground"
                  >
                    {website.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={`/dashboard/websites/${website.id}`}
                      className="text-sm font-semibold hover:underline"
                    >
                      {website.name}
                    </Link>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {website.domain}
                    </span>
                  </span>
                </div>
              </td>
              <td className="px-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_PILL[website.verificationStatus]}`}
                >
                  {website.verificationStatus}
                </span>
              </td>
              <td className="py-0 pr-6 pl-3 text-[13px] text-muted-foreground">
                {describeNextScan(website.nextScanAt, new Date())}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
