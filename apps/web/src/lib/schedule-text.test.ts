import { describe, expect, it } from 'vitest';

import { describeNextScan } from './schedule-text';

const now = new Date('2026-09-17T12:00:00.000Z');
const later = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe('describeNextScan', () => {
  it('describes off, due, and upcoming schedules', () => {
    expect(describeNextScan(null, now)).toBe('Scheduled scans are off');
    expect(describeNextScan(later(-1000), now)).toBe('Next scheduled scan is due now');
    expect(describeNextScan(later(20_000), now)).toBe('Next scheduled scan in 1 minute');
    expect(describeNextScan(later(30 * 60_000), now)).toBe('Next scheduled scan in 30 minutes');
    expect(describeNextScan(later(6 * 3_600_000), now)).toBe('Next scheduled scan in 6 hours');
    expect(describeNextScan(later(3 * 86_400_000), now)).toBe('Next scheduled scan in 3 days');
  });
});
