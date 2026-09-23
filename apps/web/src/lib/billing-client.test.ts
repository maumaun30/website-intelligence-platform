import { afterEach, describe, expect, it, vi } from 'vitest';

import { getBilling, openPortal, startCheckout } from './billing-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

const state = {
  plan: 'pro',
  limits: {
    websites: 10,
    pagesPerScan: 1000,
    scanFrequencies: ['manual', 'daily', 'weekly'],
    aiExplanationsPerMonth: 100,
  },
  usage: { websites: 2, aiExplanationsThisMonth: 4 },
  plans: {
    free: {
      websites: 1,
      pagesPerScan: 100,
      scanFrequencies: ['manual'],
      aiExplanationsPerMonth: 0,
    },
    pro: {
      websites: 10,
      pagesPerScan: 1000,
      scanFrequencies: ['manual', 'daily', 'weekly'],
      aiExplanationsPerMonth: 100,
    },
    agency: {
      websites: 50,
      pagesPerScan: 10000,
      scanFrequencies: ['manual', 'daily', 'weekly'],
      aiExplanationsPerMonth: 500,
    },
  },
  subscription: null,
};

describe('getBilling', () => {
  it('parses the billing state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => state }),
    );

    await expect(getBilling()).resolves.toMatchObject({ plan: 'pro', usage: { websites: 2 } });
  });

  it('throws an ApiError on a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    await expect(getBilling()).rejects.toMatchObject({ status: 403 });
  });
});

describe('startCheckout', () => {
  it('posts the plan and returns the redirect url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://stripe.test/checkout/o1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(startCheckout('pro')).resolves.toEqual({
      url: 'https://stripe.test/checkout/o1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/billing/checkout'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan: 'pro' }) }),
    );
  });

  it('carries the refusal code off a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ details: { code: 'SUBSCRIPTION_EXISTS' } }),
      }),
    );

    await expect(startCheckout('pro')).rejects.toMatchObject({
      status: 409,
      code: 'SUBSCRIPTION_EXISTS',
    });
  });
});

describe('openPortal', () => {
  it('returns the portal url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://stripe.test/portal/cus_1' }),
      }),
    );

    await expect(openPortal()).resolves.toEqual({ url: 'https://stripe.test/portal/cus_1' });
  });
});
