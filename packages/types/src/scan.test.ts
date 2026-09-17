import { describe, expect, it } from 'vitest';

import { PAGE_LIST_DEFAULT_LIMIT, pageListQuerySchema, scanSchema } from './scan';

describe('pageListQuerySchema', () => {
  it('coerces query-string numbers and applies defaults', () => {
    expect(pageListQuerySchema.parse({})).toEqual({ limit: PAGE_LIST_DEFAULT_LIMIT, offset: 0 });
    expect(pageListQuerySchema.parse({ limit: '10', offset: '20' })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it('rejects a limit above the cap and a negative offset', () => {
    expect(pageListQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
    expect(pageListQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('scanSchema', () => {
  it('accepts a completed scan with a stop reason', () => {
    const parsed = scanSchema.safeParse({
      id: 's1',
      websiteId: 'w1',
      organizationId: 'o1',
      status: 'completed',
      stopReason: 'maxPages',
      startedAt: '2026-09-17T00:00:00.000Z',
      finishedAt: '2026-09-17T00:01:00.000Z',
      pagesCrawled: 500,
      pagesFailed: 3,
      error: null,
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:01:00.000Z',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const parsed = scanSchema.safeParse({ status: 'paused' });

    expect(parsed.success).toBe(false);
  });
});
