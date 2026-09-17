'use client';

import { HealthStatus } from '@/components/health-status';
import { OverviewTable } from '@/components/overview-table';
import { useOverview } from '@/lib/use-insights';

export default function DashboardPage() {
  const overview = useOverview();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Health of your websites, worst first.</p>
      </header>

      <section className="flex flex-col gap-4">
        {overview.isPending ? (
          <p className="text-sm text-muted-foreground">Loading websites…</p>
        ) : overview.isError ? (
          <p className="text-sm text-destructive">Could not load the overview.</p>
        ) : (
          <OverviewTable rows={overview.data} />
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-xs font-medium text-muted-foreground">System health</h2>
        <HealthStatus />
      </section>
    </div>
  );
}
