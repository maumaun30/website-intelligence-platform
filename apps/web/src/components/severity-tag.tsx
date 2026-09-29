import type { IssueSeverity } from '@wintel/types';

/**
 * Severities are squared tags, so they never read as a score band, and each one carries its own
 * glyph shape as well as its colour: triangle, circle, square.
 */
const SEVERITY = {
  critical: {
    word: 'Critical',
    className: 'bg-destructive-soft text-destructive-soft-foreground',
    glyph: <path d="M6 1l5 9H1z" fill="currentColor" />,
  },
  warning: {
    word: 'Warning',
    className: 'bg-warning-soft text-warning-soft-foreground',
    glyph: <circle cx="6" cy="6" r="5" fill="currentColor" />,
  },
  notice: {
    word: 'Notice',
    className: 'bg-muted text-muted-foreground',
    glyph: <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />,
  },
} as const satisfies Record<IssueSeverity, unknown>;

export function SeverityTag({ severity, count }: { severity: IssueSeverity; count?: number }) {
  const { word, className, glyph } = SEVERITY[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        {glyph}
      </svg>
      {count === undefined ? word : `${count} ${word.toLowerCase()}`}
    </span>
  );
}
