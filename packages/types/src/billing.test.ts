import { describe, expect, it } from 'vitest';

import {
  PLAN_LIMITS,
  effectivePageCap,
  evaluatePlanChange,
  evaluateQuota,
  startOfUtcMonth,
  utcMonthKey,
} from './billing';

describe('evaluateQuota: websites', () => {
  it('allows a create below the limit', () => {
    expect(evaluateQuota({ plan: 'pro', kind: 'websites', current: 9 })).toEqual({ allowed: true });
  });

  it('refuses at the limit with the numbers the UI shows', () => {
    expect(evaluateQuota({ plan: 'free', kind: 'websites', current: 1 })).toEqual({
      allowed: false,
      code: 'PLAN_WEBSITE_LIMIT',
      limit: 1,
      current: 1,
    });
  });

  it('refuses above the limit, as a grandfathered downgrade leaves it', () => {
    expect(evaluateQuota({ plan: 'free', kind: 'websites', current: 8 })).toMatchObject({
      allowed: false,
      code: 'PLAN_WEBSITE_LIMIT',
      current: 8,
    });
  });
});

describe('evaluateQuota: scanFrequency', () => {
  it('allows manual on every plan', () => {
    for (const plan of ['free', 'pro', 'agency'] as const) {
      expect(evaluateQuota({ plan, kind: 'scanFrequency', scanFrequency: 'manual' })).toEqual({
        allowed: true,
      });
    }
  });

  it('refuses daily on free and allows it on pro', () => {
    expect(evaluateQuota({ plan: 'free', kind: 'scanFrequency', scanFrequency: 'daily' })).toEqual({
      allowed: false,
      code: 'PLAN_SCAN_FREQUENCY',
    });
    expect(evaluateQuota({ plan: 'pro', kind: 'scanFrequency', scanFrequency: 'daily' })).toEqual({
      allowed: true,
    });
  });
});

describe('evaluateQuota: aiExplanations', () => {
  it('reports a zero limit as locked, not exhausted', () => {
    expect(evaluateQuota({ plan: 'free', kind: 'aiExplanations', current: 0 })).toEqual({
      allowed: false,
      code: 'PLAN_AI_LOCKED',
    });
  });

  it('allows below the monthly limit and refuses at it', () => {
    expect(evaluateQuota({ plan: 'pro', kind: 'aiExplanations', current: 99 })).toEqual({
      allowed: true,
    });
    expect(evaluateQuota({ plan: 'pro', kind: 'aiExplanations', current: 100 })).toEqual({
      allowed: false,
      code: 'PLAN_AI_LIMIT',
      limit: 100,
      current: 100,
    });
  });
});

describe('effectivePageCap', () => {
  it('keeps a website below the plan ceiling', () => {
    expect(effectivePageCap('pro', 500)).toBe(500);
  });

  it('clamps a website above the plan ceiling', () => {
    expect(effectivePageCap('free', 500)).toBe(PLAN_LIMITS.free.pagesPerScan);
  });
});

describe('evaluatePlanChange', () => {
  it('downgrades nothing when every frequency stays allowed', () => {
    expect(
      evaluatePlanChange({
        plan: 'pro',
        websites: [
          { id: 'a', scanFrequency: 'daily' },
          { id: 'b', scanFrequency: 'manual' },
        ],
      }),
    ).toEqual({ frequencyDowngrades: [] });
  });

  it('lists only the websites whose frequency the new plan forbids', () => {
    expect(
      evaluatePlanChange({
        plan: 'free',
        websites: [
          { id: 'a', scanFrequency: 'daily' },
          { id: 'b', scanFrequency: 'manual' },
          { id: 'c', scanFrequency: 'weekly' },
        ],
      }),
    ).toEqual({ frequencyDowngrades: ['a', 'c'] });
  });
});

describe('startOfUtcMonth', () => {
  it('returns midnight UTC on the first of the month', () => {
    expect(startOfUtcMonth(new Date('2026-09-21T13:45:12.000Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });
});

describe('utcMonthKey', () => {
  it('formats the UTC month as YYYY-MM with a zero-padded month', () => {
    expect(utcMonthKey(new Date('2026-03-15T12:00:00.000Z'))).toBe('2026-03');
  });

  it('uses the UTC month, not the local one, at a month boundary', () => {
    expect(utcMonthKey(new Date('2026-09-30T23:59:59.999Z'))).toBe('2026-09');
    expect(utcMonthKey(new Date('2026-10-01T00:00:00.000Z'))).toBe('2026-10');
  });
});
