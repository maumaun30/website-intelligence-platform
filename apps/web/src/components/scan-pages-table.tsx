'use client';

import { Button } from '@wintel/ui';
import { useState } from 'react';

import { SCAN_PAGE_SIZE, useScanPages } from '@/lib/use-scans';

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return '—';
  }
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Pages of one scan, in crawl order. Failed pages are highlighted rather than filtered out. */
export function ScanPagesTable({ scanId, pagesCrawled }: { scanId: string; pagesCrawled: number }) {
  const [offset, setOffset] = useState(0);
  const { data, isPending, isError } = useScanPages(scanId, offset, pagesCrawled);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading pages…</p>;
  }

  if (isError) {
    return <p className="text-sm text-destructive">Could not load pages.</p>;
  }

  if (data.total === 0) {
    return <p className="text-sm text-muted-foreground">No pages crawled yet.</p>;
  }

  const last = Math.min(offset + data.items.length, data.total);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Path</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Time</th>
              <th className="py-2 font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((page) => {
              const failed = page.error !== null || (page.statusCode ?? 0) >= 400;

              return (
                <tr key={page.id} className="border-t border-border">
                  <td className="max-w-md truncate py-2 pr-4" title={page.url}>
                    {page.path}
                  </td>
                  <td className={failed ? 'py-2 pr-4 text-destructive' : 'py-2 pr-4'}>
                    {page.statusCode ?? page.error ?? '—'}
                  </td>
                  <td className="py-2 pr-4">
                    {page.responseTimeMs === null ? '—' : `${page.responseTimeMs} ms`}
                  </td>
                  <td className="py-2">{formatBytes(page.byteSize)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {offset + 1}–{last} of {data.total}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - SCAN_PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={last >= data.total}
            onClick={() => setOffset(offset + SCAN_PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
