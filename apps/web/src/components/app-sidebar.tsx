'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UsageBar } from '@/components/usage-bar';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';
import { useBilling } from '@/lib/use-billing';
import { useOverview } from '@/lib/use-insights';

const PANEL_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
  >
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <path d="M6 2.5v11" />
  </svg>
);

const NAV = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.5" />
        <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.5" />
        <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.5" />
        <rect x="10" y="10" width="5.5" height="5.5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/dashboard/websites',
    label: 'Websites',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="6.5" />
        <path d="M2.5 9h13M9 2.5c2 2 2 11 0 13M9 2.5c-2 2-2 11 0 13" />
      </svg>
    ),
  },
  {
    href: '/dashboard/billing',
    label: 'Billing',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <rect x="2" y="4" width="14" height="10" rx="2" />
        <path d="M2 7.5h14" />
      </svg>
    ),
  },
] as const;

const PLAN_LABELS = { free: 'Free plan', pro: 'Pro plan', agency: 'Agency plan' } as const;

function initials(name: string, email: string): string {
  const source = name.trim().length > 0 ? name.trim() : email;
  const parts = source.split(/[\s@._-]+/).filter((part) => part.length > 0);
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/**
 * The app shell's navigation. It collapses from 248px to 72px and stores that in a cookie, so the
 * server renders the right width on the next load and nothing jumps after hydration.
 */
export function AppSidebar({
  user,
  initialCollapsed,
}: {
  user: { name: string; email: string };
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();
  const billing = useBilling();
  const overview = useOverview();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'};path=/;max-age=31536000;samesite=lax`;
  };

  const websiteCount = overview.data?.length;

  return (
    <aside
      className={`${collapsed ? 'w-18' : 'w-62'} flex flex-none flex-col gap-5 border-r border-border bg-card p-4 transition-[width] duration-200 ease-out`}
    >
      <div className="flex h-8 items-center justify-between gap-2">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 flex-none place-items-center rounded-md bg-brand text-sm font-bold text-brand-foreground"
          >
            W
          </span>
          {collapsed ? null : (
            <span className="text-base font-semibold tracking-tight">Wintel</span>
          )}
        </Link>
        {collapsed ? null : (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors ease-out hover:bg-accent hover:text-foreground"
          >
            {PANEL_ICON}
          </button>
        )}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand sidebar"
          className="grid h-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors ease-out hover:bg-accent hover:text-foreground"
        >
          {PANEL_ICON}
        </button>
      ) : (
        <div className="flex flex-col gap-0.5 rounded-md border border-border bg-background px-3 py-2.5">
          <span className="text-[13px] font-semibold">Your workspace</span>
          <span className="text-xs text-muted-foreground">
            {billing.data ? PLAN_LABELS[billing.data.plan] : 'Loading plan…'}
          </span>
        </div>
      )}

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active =
            item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors ease-out ${
                active
                  ? 'bg-primary-soft font-semibold text-primary-soft-foreground'
                  : 'font-medium text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {item.icon}
              {collapsed ? (
                <span className="sr-only">{item.label}</span>
              ) : (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.href === '/dashboard/websites' && websiteCount !== undefined ? (
                    <span className="tnum font-mono text-xs text-muted-foreground">
                      {websiteCount}
                    </span>
                  ) : null}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {collapsed || !billing.data ? null : (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3.5">
          <UsageBar
            label="Websites"
            used={billing.data.usage.websites}
            limit={billing.data.limits.websites}
          />
          <UsageBar
            label="AI explanations"
            used={billing.data.usage.aiExplanationsThisMonth}
            limit={billing.data.limits.aiExplanationsPerMonth}
          />
          <span className="text-[11px] text-muted-foreground">
            AI explanations reset on the 1st, 00:00 UTC
          </span>
        </div>
      )}

      {collapsed ? null : <ThemeToggle />}

      <div className="flex items-center gap-2.5 border-t border-border pt-3">
        <span
          aria-hidden="true"
          className="grid size-8 flex-none place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
        >
          {initials(user.name, user.email)}
        </span>
        {collapsed ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <SignOutButton />
          </>
        )}
      </div>
    </aside>
  );
}
