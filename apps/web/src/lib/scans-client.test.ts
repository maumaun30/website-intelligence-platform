import type { Scan } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listScanPages, startScan } from './scans-client';

const scan: Scan = {
  id: 's1',
  websiteId: 'w1',
  organizationId: 'o1',
  status: 'queued',
  trigger: 'manual',
  stopReason: null,
  startedAt: null,
  finishedAt: null,
  pagesCrawled: 0,
  pagesFailed: 0,
  error: null,
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('scans-client', () => {
  it('starts a scan and validates the response', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(scan), { status: 202 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await startScan('w1');

    expect(result.status).toBe('queued');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/websites\/w1\/scans$/),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('throws ApiError with the status on a conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 409 }))),
    );

    await expect(startScan('w1')).rejects.toMatchObject({ status: 409 });
  });

  it('passes pagination through to the pages endpoint', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, limit: 25, offset: 50 }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listScanPages('s1', { limit: 25, offset: 50 });

    expect(result.offset).toBe(50);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/scans\/s1\/pages\?limit=25&offset=50$/),
      expect.anything(),
    );
  });
});
