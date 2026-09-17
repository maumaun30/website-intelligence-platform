import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAudit, listIssues } from './audits-client';

afterEach(() => vi.unstubAllGlobals());

describe('audits-client', () => {
  it('returns null when the scan has no audit yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))),
    );

    expect(await getAudit('s1')).toBeNull();
  });

  it('throws on other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
    );

    await expect(getAudit('s1')).rejects.toMatchObject({ status: 500 });
  });

  it('filters issues by rule with pagination', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 40 }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listIssues('s1', { ruleId: 'missing-h1', limit: 20, offset: 40 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/scans\/s1\/issues\?ruleId=missing-h1&limit=20&offset=40$/),
      expect.anything(),
    );
  });
});
