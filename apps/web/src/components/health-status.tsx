'use client';

import { useQuery } from '@tanstack/react-query';
import type { DependencyCheck } from '@wintel/types';
import { Badge } from '@wintel/ui';

import { fetchHealth } from '@/lib/api-client';

const DEPENDENCY_LABELS = {
  database: 'Database',
  redis: 'Redis',
} as const;

function DependencyRow({ label, check }: { label: string; check: DependencyCheck }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {check.error === undefined ? null : (
          <span className="text-xs text-destructive">{check.error}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{check.latencyMs} ms</span>
        <Badge variant={check.status === 'up' ? 'success' : 'destructive'}>{check.status}</Badge>
      </div>
    </li>
  );
}

export function HealthStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 10_000,
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Checking API…</p>;
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3">
        <Badge variant="destructive">Unreachable</Badge>
        <p className="text-sm text-muted-foreground">
          The API did not respond. Is it running on the configured address?
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge variant={data.status === 'ok' ? 'success' : 'destructive'}>
          {data.status === 'ok' ? 'Operational' : 'Degraded'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          v{data.version} · up {data.uptimeSeconds}s
        </span>
      </div>

      <ul className="rounded-lg border border-border px-4">
        {(Object.keys(DEPENDENCY_LABELS) as Array<keyof typeof DEPENDENCY_LABELS>).map((key) => (
          <DependencyRow key={key} label={DEPENDENCY_LABELS[key]} check={data.checks[key]} />
        ))}
      </ul>
    </div>
  );
}
