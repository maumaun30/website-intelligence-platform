'use client';

import { usePathname } from 'next/navigation';

/**
 * Content rises into place when the route changes. Keyed on the pathname, so React replaces the
 * subtree and the animation runs once per navigation rather than on every render — and never on a
 * poll, which would make the dashboard shimmer every two seconds.
 *
 * `prefers-reduced-motion` is handled globally in `globals.css`.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="animate-rise">
      {children}
    </div>
  );
}
