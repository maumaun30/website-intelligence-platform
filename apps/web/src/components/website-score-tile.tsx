'use client';

import { Card } from '@wintel/ui';

import { ScoreBadge } from '@/components/score-badge';
import { ScoreDelta } from '@/components/score-delta';
import { Sparkline } from '@/components/sparkline';
import { useTrend } from '@/lib/use-insights';

const dateLabel = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Stat tile: current health score, change since the previous audit, and the recent trend. */
export function WebsiteScoreTile({ websiteId }: { websiteId: string }) {
  const { data, isPending, isError } = useTrend(websiteId);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading health…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">Could not load health history.</p>;
  }

  const scored = data.filter((point) => point.score !== null);
  const latest = data[data.length - 1];
  const previous = scored.length > 1 ? scored[scored.length - 2] : undefined;
  const latestScore = latest?.score ?? null;
  const delta =
    latestScore !== null && previous !== undefined && previous.score !== null
      ? latestScore - previous.score
      : null;

  return (
    <Card className="flex items-center justify-between gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Health score</span>
        {latest === undefined ? (
          <span className="text-sm text-muted-foreground">No audit yet</span>
        ) : (
          <div className="flex items-center gap-3">
            <ScoreBadge score={latestScore} size="lg" />
            <ScoreDelta delta={delta} />
          </div>
        )}
      </div>
      <Sparkline
        label="Health score by audit"
        points={scored.map((point) => ({
          label: dateLabel.format(new Date(point.finishedAt)),
          value: point.score as number,
        }))}
      />
    </Card>
  );
}
