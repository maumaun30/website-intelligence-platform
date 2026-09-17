import { describe, expect, it } from 'vitest';

import {
  computeHealthScore,
  diffIssues,
  issueChangeListQuerySchema,
  issueFingerprint,
  scoreBand,
  trendQuerySchema,
} from './insights';

describe('computeHealthScore', () => {
  it('is 100 for a clean site and null without pages', () => {
    expect(computeHealthScore({ critical: 0, warning: 0, notice: 0 }, 10)).toBe(100);
    expect(computeHealthScore({ critical: 0, warning: 0, notice: 0 }, 0)).toBeNull();
  });

  it('penalizes by the share of pages affected per severity', () => {
    // 100 - 60*1/4 - 30*2/4 - 10*4/4 = 100 - 15 - 15 - 10 = 60
    expect(computeHealthScore({ critical: 1, warning: 2, notice: 4 }, 4)).toBe(60);
  });

  it('rounds and never goes below zero', () => {
    expect(computeHealthScore({ critical: 1, warning: 0, notice: 0 }, 3)).toBe(80);
    expect(computeHealthScore({ critical: 5, warning: 5, notice: 5 }, 5)).toBe(0);
  });
});

describe('scoreBand', () => {
  it('bands scores at 90 and 70', () => {
    expect(scoreBand(90)).toBe('good');
    expect(scoreBand(89)).toBe('fair');
    expect(scoreBand(70)).toBe('fair');
    expect(scoreBand(69)).toBe('poor');
    expect(scoreBand(null)).toBeNull();
  });
});

describe('issueFingerprint', () => {
  it('includes the link target only when there is one', () => {
    expect(issueFingerprint('missing-h1', '/about', {})).toBe('missing-h1|/about|');
    expect(
      issueFingerprint('broken-internal-link', '/', {
        targetUrl: 'https://a.test/x',
        statusCode: 404,
      }),
    ).toBe('broken-internal-link|/|https://a.test/x');
  });
});

describe('diffIssues', () => {
  const issue = (fingerprint: string) => ({
    fingerprint,
    ruleId: fingerprint.split('|')[0]!,
    severity: 'warning' as const,
    message: 'm',
    path: fingerprint.split('|')[1]!,
  });

  it('separates new and fixed issues and ignores persisting ones', () => {
    const baseline = [issue('missing-h1|/a|'), issue('missing-title|/b|')];
    const current = [issue('missing-h1|/a|'), issue('noindex|/c|')];

    const { newIssues, fixedIssues } = diffIssues(current, baseline);

    expect(newIssues.map((entry) => entry.fingerprint)).toEqual(['noindex|/c|']);
    expect(fixedIssues.map((entry) => entry.fingerprint)).toEqual(['missing-title|/b|']);
  });

  it('deduplicates by fingerprint', () => {
    const { newIssues } = diffIssues([issue('noindex|/c|'), issue('noindex|/c|')], []);

    expect(newIssues).toHaveLength(1);
  });
});

describe('query schemas', () => {
  it('applies defaults and caps', () => {
    expect(issueChangeListQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(issueChangeListQuerySchema.safeParse({ kind: 'moved' }).success).toBe(false);
    expect(trendQuerySchema.parse({})).toEqual({ limit: 30 });
    expect(trendQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
