import Link from 'next/link';
import type { ReactNode } from 'react';

import { Wordmark } from '@/components/wordmark';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-16">
      <Link href="/">
        <Wordmark size="lg" />
      </Link>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-sm">
        {children}
      </div>
    </main>
  );
}
