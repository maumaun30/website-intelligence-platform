import type * as React from 'react';

import { cn } from '../lib/utils';

/**
 * A placeholder that holds the shape of the content it stands in for, so nothing moves when the
 * real thing arrives. The sheen is a single transform-only animation, and the global
 * `prefers-reduced-motion` rule stops it flat for anyone who asks.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        'after:animate-sheen',
        className,
      )}
      {...props}
    />
  );
}
