import { afterEach, describe, expect, it, vi } from 'vitest';

import { getExplanation, requestExplanation } from './explanations-client';

afterEach(() => vi.unstubAllGlobals());

describe('explanations-client', () => {
  it('returns null when nothing was requested yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))),
    );

    expect(await getExplanation('s1', 'missing-h1')).toBeNull();
  });

  it('posts the rule and regenerate flag', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'e1',
            auditId: 'a1',
            ruleId: 'missing-h1',
            status: 'queued',
            content: null,
            model: null,
            error: null,
            requestedAt: '2026-09-17T00:00:00.000Z',
            updatedAt: '2026-09-17T00:00:00.000Z',
          }),
          { status: 202 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await requestExplanation('s1', { ruleId: 'missing-h1', regenerate: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/scans\/s1\/audit\/explanations$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ruleId: 'missing-h1', regenerate: true }),
      }),
    );
  });

  it('surfaces the error code of a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ details: { code: 'AI_DAILY_LIMIT' } }), { status: 429 }),
        ),
      ),
    );

    await expect(
      requestExplanation('s1', { ruleId: 'missing-h1', regenerate: false }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'AI_DAILY_LIMIT',
    });
  });
});
