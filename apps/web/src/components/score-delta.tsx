/** Signed change since the previous audit. Arrow and sign carry direction; colour only reinforces it. */
export function ScoreDelta({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (delta === 0) {
    return <span className="text-xs text-muted-foreground">±0</span>;
  }
  return delta > 0 ? (
    <span className="text-xs text-success">{`▲ +${delta}`}</span>
  ) : (
    <span className="text-xs text-destructive">{`▼ −${Math.abs(delta)}`}</span>
  );
}
