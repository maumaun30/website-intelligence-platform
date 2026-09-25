'use client';

import { scoreBand } from '@wintel/types';

import { BandPill } from '@/components/score-badge';
import { ScoreDelta } from '@/components/score-delta';
import { Sparkline } from '@/components/sparkline';
import { useTrend } from '@/lib/use-insights';

const dateLabel = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Skeleton blocks match the real layout, so nothing jumps when the trend arrives. */
function LoadingTile() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-40 flex-col gap-3.5 rounded-lg border border-border bg-card p-6"
    >
      <span className="text-[13px] font-medium text-muted-foreground">Health score</span>
      <div className="h-11 w-24 rounded-md bg-muted" />
      <div className="h-5 w-28 rounded-full bg-muted" />
      <div className="h-10 flex-1 rounded-md bg-muted/60" />
      <span className="sr-only">Loading health score</span>
    </div>
  );
}

/** Stat tile: current health score, change since the previous audit, and the recent trend. */
export function WebsiteScoreTile({ websiteId }: { websiteId: string }) {
  const { data, isPending, isError } = useTrend(websiteId);

  if (isPending) {
    return <LoadingTile />;
  }
  if (isError) {
    return (
      <div className="flex min-h-40 flex-col gap-3 rounded-lg border border-border bg-card p-6">
        <span className="text-[13px] font-medium text-muted-foreground">Health score</span>
        <p className="text-sm text-destructive">Could not load health history.</p>
      </div>
    );
  }

  const scored = data.filter((point) => point.score !== null);
  const latest = data[data.length - 1];
  const previous = scored.length > 1 ? scored[scored.length - 2] : undefined;
  const latestScore = latest?.score ?? null;
  const band = scoreBand(latestScore);
  const delta =
    latestScore !== null && previous !== undefined && previous.score !== null
      ? latestScore - previous.score
      : null;

  return (
    <div className="flex min-h-40 flex-col gap-3.5 rounded-lg border border-border bg-card p-6">
      <span className="text-[13px] font-medium text-muted-foreground">Health score</span>
      {latest === undefined ? (
        <p className="text-sm text-muted-foreground">No audit yet</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="tnum text-[56px] leading-none font-semibold tracking-[-0.035em]">
              {latestScore ?? '—'}
            </span>
            <span className="text-sm font-medium text-muted-foreground">/100</span>
          </div>
          <div className="flex items-center gap-2.5">
            {band === null ? null : <BandPill band={band} />}
            <ScoreDelta delta={delta} />
          </div>
          <Sparkline
            label={`Health score, last ${scored.length} ${scored.length === 1 ? 'audit' : 'audits'}`}
            points={scored.map((point) => ({
              label: dateLabel.format(new Date(point.finishedAt)),
              value: point.score as number,
            }))}
          />
        </>
      )}
    </div>
  );
}
