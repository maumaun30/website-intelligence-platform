import Link from 'next/link';
import type { ReactNode } from 'react';

import { SignOutButton } from '@/components/sign-out-button';
import { requireSession } from '@/lib/server-session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <nav className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            Website Intelligence
          </Link>
          <Link
            href="/dashboard/websites"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Websites
          </Link>
          <Link
            href="/dashboard/billing"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Plan
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
