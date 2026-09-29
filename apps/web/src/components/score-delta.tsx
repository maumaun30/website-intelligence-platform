/**
 * Signed change since the previous audit. The arrow and sign carry the direction, colour only
 * reinforces it, and screen readers get it in words.
 */
export function ScoreDelta({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span aria-label="No previous audit" className="text-xs text-muted-foreground">
        —
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span aria-label="No change" className="tnum text-xs text-muted-foreground">
        ±0
      </span>
    );
  }
  return delta > 0 ? (
    <span aria-label={`Up ${delta} points`} className="tnum text-xs font-semibold text-success">
      {`▲ +${delta}`}
    </span>
  ) : (
    <span
      aria-label={`Down ${Math.abs(delta)} points`}
      className="tnum text-xs font-semibold text-destructive"
    >
      {`▼ −${Math.abs(delta)}`}
    </span>
  );
}
