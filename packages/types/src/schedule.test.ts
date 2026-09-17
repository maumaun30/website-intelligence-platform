import { describe, expect, it } from 'vitest';

import { SCAN_DEADLINE_MS } from './scan-jobs';
import { computeNextScanAt, evaluateScanStart, isStaleScan } from './schedule';

const now = new Date('2026-09-17T12:00:00.000Z');

describe('computeNextScanAt', () => {
  it('adds one day or one week, and turns scheduling off for manual', () => {
    expect(computeNextScanAt('daily', now)?.toISOString()).toBe('2026-09-18T12:00:00.000Z');
    expect(computeNextScanAt('weekly', now)?.toISOString()).toBe('2026-09-24T12:00:00.000Z');
    expect(computeNextScanAt('manual', now)).toBeNull();
  });
});

describe('isStaleScan', () => {
  it('treats only a running scan past the deadline as stale', () => {
    const old = new Date(now.getTime() - SCAN_DEADLINE_MS - 1);

    expect(isStaleScan({ id: 's', status: 'running', startedAt: old }, now)).toBe(true);
    expect(isStaleScan({ id: 's', status: 'running', startedAt: now }, now)).toBe(false);
    expect(isStaleScan({ id: 's', status: 'queued', startedAt: null }, now)).toBe(false);
  });
});

describe('evaluateScanStart', () => {
  it('refuses unverified websites before anything else', () => {
    expect(evaluateScanStart({ verificationStatus: 'pending', activeScan: null, now })).toEqual({
      action: 'refuse',
      code: 'WEBSITE_NOT_VERIFIED',
    });
  });

  it('starts when nothing is active', () => {
    expect(evaluateScanStart({ verificationStatus: 'verified', activeScan: null, now })).toEqual({
      action: 'start',
      staleScanId: null,
    });
  });

  it('refuses while a live scan is active', () => {
    const activeScan = { id: 's0', status: 'queued', startedAt: null };

    expect(evaluateScanStart({ verificationStatus: 'verified', activeScan, now })).toEqual({
      action: 'refuse',
      code: 'SCAN_IN_PROGRESS',
    });
  });

  it('starts and names the stale scan to release', () => {
    const activeScan = {
      id: 's0',
      status: 'running',
      startedAt: new Date(now.getTime() - SCAN_DEADLINE_MS - 1),
    };

    expect(evaluateScanStart({ verificationStatus: 'verified', activeScan, now })).toEqual({
      action: 'start',
      staleScanId: 's0',
    });
  });
});
