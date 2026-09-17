'use client';

import { Card } from '@wintel/ui';
import { use } from 'react';

import { ScanConfigForm } from '@/components/scan-config-form';
import { ScanPanel } from '@/components/scan-panel';
import { VerificationPanel } from '@/components/verification-panel';
import { useWebsite } from '@/lib/use-websites';

export default function WebsiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isPending, isError } = useWebsite(id);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (isError || !data) {
    return <p className="text-sm text-destructive">Could not load this website.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
        <p className="text-sm text-muted-foreground">{data.url}</p>
      </header>

      <VerificationPanel website={data} />

      <ScanPanel website={data} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Scan configuration</h2>
        <Card>
          <ScanConfigForm website={data} />
        </Card>
      </section>
    </div>
  );
}
