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

function StatusPill({ tone, children }: { tone: 'up' | 'down'; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-2.5 text-xs font-semibold ${
        tone === 'up'
          ? 'bg-success-soft text-success-soft-foreground'
          : 'bg-destructive-soft text-destructive-soft-foreground'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.75 rounded-full ${tone === 'up' ? 'bg-success' : 'bg-destructive'}`}
      />
      {children}
    </span>
  );
}

/**
 * The same health check as one quiet line, for the foot of a page whose subject is something else.
 * It shares the `health` query with {@link HealthStatus}, so it costs no extra request.
 */
export function HealthStrip() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 10_000,
  });

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-card px-5 py-3 text-xs text-muted-foreground">
      {isPending ? (
        <span>Checking the API…</span>
      ) : isError ? (
        <>
          <StatusPill tone="down">Unreachable</StatusPill>
          <span>The API did not respond. Is it running on the configured address?</span>
        </>
      ) : (
        <>
          <StatusPill tone={data.status === 'ok' ? 'up' : 'down'}>
            {data.status === 'ok' ? 'Operational' : 'Degraded'}
          </StatusPill>
          <span>System health</span>
          <span className="font-mono">
            API v{data.version} · up {data.uptimeSeconds}s
          </span>
          <span className="flex-1" />
          {(Object.keys(DEPENDENCY_LABELS) as Array<keyof typeof DEPENDENCY_LABELS>).map((key) => (
            <span key={key}>
              {DEPENDENCY_LABELS[key]}{' '}
              <strong className="font-medium text-foreground">{data.checks[key].status}</strong> ·{' '}
              {data.checks[key].latencyMs} ms
            </span>
          ))}
        </>
      )}
    </div>
  );
}
