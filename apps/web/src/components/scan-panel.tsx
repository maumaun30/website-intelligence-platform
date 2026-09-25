'use client';

import type { ScanStopReason, Website } from '@wintel/types';
import { Button } from '@wintel/ui';

import { isActiveScan, useScans, useStartScan } from '@/lib/use-scans';

const STOP_REASON_TEXT: Record<ScanStopReason, string> = {
  finished: 'Crawled every reachable page.',
  maxPages: 'Stopped at the page limit.',
  maxDepth: 'Stopped at the depth limit.',
  deadline: 'Stopped at the 10-minute time limit.',
};

const dateTime = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/**
 * Starts crawls and reports the newest one. While a scan runs the card keeps its height and only
 * the bar's transform changes, so a page that polls every two seconds never moves under the eye.
 */
export function ScanPanel({ website }: { website: Website }) {
  const scans = useScans(website.id);
  const start = useStartScan(website.id);

  const latest = scans.data?.[0];
  const active = isActiveScan(latest);
  const verified = website.verificationStatus === 'verified';
  const share =
    latest && website.maxPages > 0 ? Math.min(latest.pagesCrawled / website.maxPages, 1) : 0;

  return (
    <div
      aria-live="polite"
      className={`flex min-h-40 flex-col gap-3.5 rounded-lg border bg-card p-6 ${
        active ? 'border-primary/40' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          {active ? (
            <>
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-primary ring-4 ring-primary-soft"
              />
              <span className="text-primary">Scan in progress</span>
            </>
          ) : (
            'Latest scan'
          )}
        </span>
        <Button
          size="sm"
          onClick={() => start.mutate()}
          disabled={!verified || active || start.isPending}
        >
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
        <>
          <div className="flex items-baseline gap-2">
            <span className="tnum text-4xl leading-none font-semibold tracking-[-0.02em]">
              {latest.pagesCrawled}
            </span>
            <span className="text-sm text-muted-foreground">
              {active ? `of up to ${website.maxPages} pages crawled` : 'pages crawled'}
              {latest.pagesFailed > 0 ? ` · ${latest.pagesFailed} failed` : ''}
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Scan progress"
            aria-valuenow={Math.round(share * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-primary-soft"
          >
            <div
              className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-out"
              style={{ transform: `scaleX(${active ? share : 1})` }}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            <span className="capitalize">{latest.status}</span>
            {latest.trigger === 'scheduled' ? ' · scheduled' : ''}
            {latest.finishedAt === null
              ? ''
              : ` · ${dateTime.format(new Date(latest.finishedAt))} UTC`}
            {latest.stopReason === null ? '' : ` · ${STOP_REASON_TEXT[latest.stopReason]}`}
          </p>
          {latest.error === null ? null : (
            <p className="text-xs text-destructive">{latest.error}</p>
          )}
        </>
      )}
    </div>
  );
}
