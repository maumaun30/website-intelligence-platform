import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTrend, listChanges } from './insights-client';

afterEach(() => vi.unstubAllGlobals());

describe('insights-client', () => {
  it('reads a website trend', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('[]', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getTrend('w1')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/websites\/w1\/trend$/),
      expect.anything(),
    );
  });

  it('filters changes by kind with pagination', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listChanges('s1', { kind: 'fixed', limit: 20, offset: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/scans\/s1\/changes\?kind=fixed&limit=20&offset=0$/),
      expect.anything(),
    );
  });
});
