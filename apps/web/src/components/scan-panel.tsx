'use client';

import type { ScanStatus, ScanStopReason, Website } from '@wintel/types';
import { Badge, Button, Card } from '@wintel/ui';

import { ScanPagesTable } from '@/components/scan-pages-table';
import { isActiveScan, useScans, useStartScan } from '@/lib/use-scans';

const STATUS_VARIANT: Record<ScanStatus, 'default' | 'success' | 'destructive' | 'outline'> = {
  queued: 'outline',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
};

const STOP_REASON_TEXT: Record<ScanStopReason, string> = {
  finished: 'Crawled every reachable page.',
  maxPages: 'Stopped at the page limit.',
  maxDepth: 'Stopped at the depth limit.',
  deadline: 'Stopped at the 10-minute time limit.',
};

/** Starts crawls of a website and shows the newest one: live while it runs, its pages once it has any. */
export function ScanPanel({ website }: { website: Website }) {
  const scans = useScans(website.id);
  const start = useStartScan(website.id);

  const latest = scans.data?.[0];
  const active = isActiveScan(latest);
  const verified = website.verificationStatus === 'verified';

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Scans</h2>
        <Button onClick={() => start.mutate()} disabled={!verified || active || start.isPending}>
          {active ? 'Scanning…' : 'Scan'}
        </Button>
      </div>

      {verified ? null : (
        <p className="text-sm text-muted-foreground">Verify ownership to enable scanning.</p>
      )}
      {start.error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not start a scan.
        </p>
      ) : null}

      {latest === undefined ? (
        <p className="text-sm text-muted-foreground">No scans yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[latest.status]}>{latest.status}</Badge>
              <span className="text-sm">
                {`${latest.pagesCrawled} pages crawled · ${latest.pagesFailed} failed`}
              </span>
            </div>
            {latest.stopReason === null ? null : (
              <p className="text-xs text-muted-foreground">{STOP_REASON_TEXT[latest.stopReason]}</p>
            )}
            {latest.error === null ? null : (
              <p className="text-xs text-destructive">{latest.error}</p>
            )}
          </div>
          <ScanPagesTable scanId={latest.id} pagesCrawled={latest.pagesCrawled} />
        </div>
      )}
    </Card>
  );
}
