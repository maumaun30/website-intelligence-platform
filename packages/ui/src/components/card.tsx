import type * as React from 'react';

import { cn } from '../lib/utils';

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-lg border border-border bg-card p-6 shadow-sm', className)}
      {...props}
    />
  );
}
