import { type ScoreBand, scoreBand } from '@wintel/types';
import { Badge } from '@wintel/ui';

const BAND: Record<ScoreBand, { word: string; variant: 'success' | 'outline' | 'destructive' }> = {
  good: { word: 'Good', variant: 'success' },
  fair: { word: 'Fair', variant: 'outline' },
  poor: { word: 'Poor', variant: 'destructive' },
};

/** Health score with its band. The word always accompanies the colour. */
export function ScoreBadge({ score }: { score: number | null }) {
  const band = scoreBand(score);
  if (score === null || band === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return <Badge variant={BAND[band].variant}>{`${score} · ${BAND[band].word}`}</Badge>;
}
