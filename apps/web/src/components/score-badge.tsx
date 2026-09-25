import { type ScoreBand, scoreBand } from '@wintel/types';

const BAND: Record<ScoreBand, { word: string; className: string; dot: string }> = {
  good: {
    word: 'Good',
    className: 'bg-success-soft text-success-soft-foreground',
    dot: 'bg-success',
  },
  fair: {
    word: 'Fair',
    className: 'bg-warning-soft text-warning-soft-foreground',
    dot: 'bg-warning',
  },
  poor: {
    word: 'Poor',
    className: 'bg-destructive-soft text-destructive-soft-foreground',
    dot: 'bg-destructive',
  },
};

/** Just the band, as a pill: a dot for colour and always the word beside it. */
export function BandPill({ band }: { band: ScoreBand }) {
  const { word, className, dot } = BAND[band];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-2.5 text-xs font-semibold ${className}`}
    >
      <span aria-hidden="true" className={`size-1.75 rounded-full ${dot}`} />
      {word}
    </span>
  );
}

const SIZES = {
  md: 'text-xl font-semibold',
  lg: 'text-[44px] leading-none font-semibold tracking-[-0.03em]',
} as const;

/**
 * Health score with its band. The number is the thing you read first, the pill says which band it
 * falls in, and the word always accompanies the colour.
 */
export function ScoreBadge({
  score,
  size = 'md',
}: {
  score: number | null;
  size?: keyof typeof SIZES;
}) {
  const band = scoreBand(score);
  if (score === null || band === null) {
    return <span className="text-sm text-muted-foreground">Not scored yet</span>;
  }
  return (
    <span className="flex items-center gap-2.5">
      <span className={`tnum ${SIZES[size]}`}>{score}</span>
      <BandPill band={band} />
    </span>
  );
}
