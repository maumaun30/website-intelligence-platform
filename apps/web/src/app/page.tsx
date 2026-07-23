import { HealthStatus } from '@/components/health-status';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Website Intelligence Platform</h1>
        <p className="text-sm text-muted-foreground">
          Foundation slice. This page reports live API health; product features arrive with the next
          slices.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Platform status
        </h2>
        <HealthStatus />
      </section>
    </main>
  );
}
