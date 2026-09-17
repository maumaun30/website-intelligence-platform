const relative = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

/** Human wording for a website's next scheduled scan. */
export function describeNextScan(nextScanAt: string | null, now: Date): string {
  if (nextScanAt === null) {
    return 'Scheduled scans are off';
  }
  const diffMs = new Date(nextScanAt).getTime() - now.getTime();
  if (diffMs <= 0) {
    return 'Next scheduled scan is due now';
  }
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) {
    return `Next scheduled scan ${relative.format(minutes, 'minute')}`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `Next scheduled scan ${relative.format(hours, 'hour')}`;
  }
  return `Next scheduled scan ${relative.format(Math.round(hours / 24), 'day')}`;
}
