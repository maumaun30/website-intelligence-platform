'use client';

import { Badge, Card } from '@wintel/ui';
import Link from 'next/link';

import { useWebsites } from '@/lib/use-websites';

const STATUS_VARIANT = {
  verified: 'success',
  pending: 'outline',
  failed: 'destructive',
} as const;

export function WebsitesList() {
  const { data, isPending, isError } = useWebsites();

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading websites…</p>;
  }

  if (isError) {
    return <p className="text-sm text-destructive">Could not load websites.</p>;
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No websites yet. Add your first below.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.map((website) => (
        <li key={website.id}>
          <Link href={`/dashboard/websites/${website.id}`}>
            <Card className="flex items-center justify-between p-4 transition-colors hover:bg-accent">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{website.name}</span>
                <span className="text-xs text-muted-foreground">{website.domain}</span>
              </div>
              <Badge variant={STATUS_VARIANT[website.verificationStatus]}>
                {website.verificationStatus}
              </Badge>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
