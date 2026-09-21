/** Usage against a plan limit. The numbers are stated in text; the bar only repeats them. */
export function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const share = limit === 0 ? 1 : Math.min(used / limit, 1);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={
            share >= 1 ? 'h-1.5 rounded-full bg-destructive' : 'h-1.5 rounded-full bg-primary'
          }
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
    </div>
  );
}
