import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, letting later Tailwind utilities override earlier conflicting ones.
 * Without the merge step, `cn('px-2', 'px-4')` would emit both and leave the winner to
 * stylesheet order, which callers cannot reason about.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
