import { HealthStatus } from '@/components/health-status';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live status of your platform services.</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">System health</h2>
        <HealthStatus />
      </section>
    </div>
  );
}
