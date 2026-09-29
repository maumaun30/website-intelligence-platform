import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { AppBreadcrumbs } from '@/components/app-breadcrumbs';
import { AppSidebar } from '@/components/app-sidebar';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';
import { requireSession } from '@/lib/server-session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === 'collapsed';

  return (
    <div className="flex min-h-dvh">
      <AppSidebar user={user} initialCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 flex-none items-center border-b border-border bg-card px-10">
          <AppBreadcrumbs />
        </header>
        <main className="flex-1 px-10 py-9">{children}</main>
      </div>
    </div>
  );
}
