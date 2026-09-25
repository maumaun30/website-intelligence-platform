import type { OverviewRow } from '@wintel/types';
import { scoreBand } from '@wintel/types';
import Link from 'next/link';

import { BandPill } from '@/components/score-badge';
import { ScoreDelta } from '@/components/score-delta';

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** The website with the steepest drop, weighted by how many critical issues came with it. */
function fixFirst(rows: OverviewRow[]): OverviewRow | undefined {
  const candidates = rows.filter((row) => (row.criticalCount ?? 0) > 0);
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates.reduce((worst, row) => {
    const weight = (value: OverviewRow) =>
      (value.criticalCount ?? 0) * 10 - Math.min(value.scoreDelta ?? 0, 0);
    return weight(row) > weight(worst) ? row : worst;
  });
}

/**
 * The three questions this product exists to answer, in the same place on every load: how healthy
 * the portfolio is, how much is on fire, and what to open first.
 */
export function OverviewStats({ rows }: { rows: OverviewRow[] }) {
  const scored = rows.filter((row): row is OverviewRow & { score: number } => row.score !== null);
  const average =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((sum, row) => sum + row.score, 0) / scored.length);
  const band = scoreBand(average);

  const changed = rows.filter(
    (row): row is OverviewRow & { scoreDelta: number } => row.scoreDelta !== null,
  );
  const averageDelta =
    changed.length === 0
      ? null
      : Math.round(changed.reduce((sum, row) => sum + row.scoreDelta, 0) / changed.length);

  const critical = rows.reduce((sum, row) => sum + (row.criticalCount ?? 0), 0);
  const withCritical = rows.filter((row) => (row.criticalCount ?? 0) > 0).length;
  const worst = fixFirst(rows);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.35fr]">
      <StatCard label="Average health">
        <div className="flex items-baseline gap-3">
          <span className="tnum text-[44px] leading-none font-semibold tracking-[-0.03em]">
            {average ?? '—'}
          </span>
          {band === null ? null : <BandPill band={band} />}
        </div>
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <ScoreDelta delta={averageDelta} />
          average change since the previous audit
        </span>
      </StatCard>

      <StatCard label="Critical issues">
        <div className="flex items-baseline gap-3">
          <span className="tnum text-[44px] leading-none font-semibold tracking-[-0.03em]">
            {critical}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {withCritical === 1 ? 'on 1 website' : `across ${withCritical} websites`}
          </span>
        </div>
        <span className="text-[13px] text-muted-foreground">
          {scored.length === rows.length
            ? 'Every website has been audited'
            : `${rows.length - scored.length} of ${rows.length} not audited yet`}
        </span>
      </StatCard>

      <StatCard label="Fix first">
        {worst === undefined ? (
          <p className="text-[13px] text-muted-foreground">
            No critical issues anywhere. Nothing needs attention right now.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-lg font-semibold tracking-[-0.01em]">
                {worst.name}
                {worst.scoreDelta !== null && worst.scoreDelta < 0
                  ? ` lost ${Math.abs(worst.scoreDelta)} points in its last audit`
                  : ' needs attention'}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {worst.criticalCount} critical {worst.criticalCount === 1 ? 'issue' : 'issues'} on{' '}
                <span className="font-mono">{worst.domain}</span>
              </span>
            </div>
            <Link
              href={`/dashboard/websites/${worst.websiteId}`}
              className="mt-auto inline-flex h-8.5 w-fit items-center rounded-md bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-colors ease-out hover:bg-primary/90"
            >
              Open audit
            </Link>
          </>
        )}
      </StatCard>
    </div>
  );
}
