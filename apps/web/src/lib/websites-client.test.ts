import type { Website } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebsite, listWebsites } from './websites-client';

const sample: Website = {
  id: 'w1',
  organizationId: 'o1',
  createdById: 'u1',
  name: 'Acme',
  url: 'https://acme.test',
  domain: 'acme.test',
  verificationStatus: 'pending',
  verificationMethod: null,
  verificationToken: 'tok',
  verifiedAt: null,
  maxDepth: 3,
  maxPages: 500,
  includePaths: [],
  excludePaths: [],
  scanFrequency: 'manual',
  respectRobotsTxt: true,
  nextScanAt: null,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('websites-client', () => {
  it('lists websites and validates the payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify([sample]), { status: 200 }))),
    );

    const result = await listWebsites();

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Acme');
  });

  it('throws ApiError on a non-2xx create', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('conflict', { status: 409 }))),
    );

    await expect(createWebsite({ name: 'Acme', url: 'https://acme.test' })).rejects.toMatchObject({
      status: 409,
    });
  });
});
