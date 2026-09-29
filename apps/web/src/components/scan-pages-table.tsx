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
    <div className="flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-card">
      <div className="max-h-160 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-6 py-3 font-medium">
                Path
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Time
              </th>
              <th scope="col" className="py-3 pr-6 pl-3 font-medium">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((page) => {
              const failed = page.error !== null || (page.statusCode ?? 0) >= 400;

              return (
                <tr key={page.id} className="border-t border-border">
                  <td className="max-w-md truncate px-6 py-2.5 font-mono text-xs" title={page.url}>
                    {page.path}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="tnum">{page.statusCode ?? page.error ?? '—'}</span>
                    {/* The code alone reads as data; the word says what it means. */}
                    {failed ? (
                      <span className="ml-2 rounded-sm bg-destructive-soft px-1.5 py-0.5 text-xs font-semibold text-destructive-soft-foreground">
                        Broken
                      </span>
                    ) : null}
                  </td>
                  <td className="tnum px-3 py-2.5">
                    {page.responseTimeMs === null ? '—' : `${page.responseTimeMs} ms`}
                  </td>
                  <td className="tnum py-2.5 pr-6 pl-3">{formatBytes(page.byteSize)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3 text-xs text-muted-foreground">
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
