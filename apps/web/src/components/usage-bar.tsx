/** Usage against a plan limit. The numbers are stated in text; the bar only repeats them. */
export function UsageBar({
  label,
  used,
  limit,
  labelHidden = false,
}: {
  label: string;
  used: number;
  limit: number;
  /** The surrounding card already names it; the bar keeps the label for screen readers only. */
  labelHidden?: boolean;
}) {
  const share = limit === 0 ? 1 : Math.min(used / limit, 1);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs font-medium">
        <span className={labelHidden ? 'sr-only' : 'text-muted-foreground'}>{label}</span>
        <span className="tnum font-mono text-muted-foreground">
          {used} / {limit}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-out ${
            share >= 1 ? 'bg-destructive' : 'bg-primary'
          }`}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
    </div>
  );
}
