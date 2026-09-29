'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useWebsites } from '@/lib/use-websites';

const LABELS: Record<string, string> = {
  dashboard: 'Overview',
  websites: 'Websites',
  billing: 'Billing',
};

/**
 * Where you are, from the path. A website id is replaced by that website's name once it is loaded
 * from the cache the detail page already fills.
 */
export function AppBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const websiteId =
    segments[0] === 'dashboard' && segments[1] === 'websites' && segments[2] !== undefined
      ? segments[2]
      : undefined;
  // The list is already cached by the websites page, so this adds no request of its own.
  const websites = useWebsites();
  const websiteName = websites.data?.find((candidate) => candidate.id === websiteId)?.name;

  const crumbs = segments.map((segment, index) => ({
    label: segment === websiteId ? (websiteName ?? 'Website') : (LABELS[segment] ?? segment),
    href: `/${segments.slice(0, index + 1).join('/')}`,
  }));

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] font-medium">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-border">
                /
              </span>
            ) : null}
            {last ? (
              <span aria-current="page" className="text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="text-muted-foreground hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
