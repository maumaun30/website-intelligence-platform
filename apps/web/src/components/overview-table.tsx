import type { OverviewRow } from '@wintel/types';
import Link from 'next/link';

import { ScoreBadge } from '@/components/score-badge';
import { ScoreDelta } from '@/components/score-delta';
import { describeNextScan } from '@/lib/schedule-text';

const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** Every website in the organization, in the order given (the API sorts worst health first). */
export function OverviewTable({ rows }: { rows: OverviewRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No websites yet.{' '}
        <Link href="/dashboard/websites" className="underline">
          Add your first website
        </Link>
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">Website</th>
            <th className="py-2 pr-4 font-medium">Health</th>
            <th className="py-2 pr-4 font-medium">Change</th>
            <th className="py-2 pr-4 font-medium">Critical</th>
            <th className="py-2 pr-4 font-medium">Last scan</th>
            <th className="py-2 font-medium">Schedule</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.websiteId} className="border-t border-border">
              <td className="py-2 pr-4">
                <div className="flex flex-col">
                  <Link
                    href={`/dashboard/websites/${row.websiteId}`}
                    className="font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{row.domain}</span>
                </div>
              </td>
              <td className="py-2 pr-4">
                <ScoreBadge score={row.score} />
              </td>
              <td className="py-2 pr-4">
                <ScoreDelta delta={row.scoreDelta} />
              </td>
              <td className="py-2 pr-4">{row.criticalCount ?? '—'}</td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">
                {row.lastScan
                  ? `${dateTime.format(new Date(row.lastScan.createdAt))}${row.lastScan.trigger === 'scheduled' ? ' · scheduled' : ''}`
                  : 'Not scanned yet'}
              </td>
              <td className="py-2 text-xs text-muted-foreground">
                {describeNextScan(row.nextScanAt, new Date())}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
