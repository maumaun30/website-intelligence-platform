import { afterEach, describe, expect, it, vi } from 'vitest';

import { changePlan, getBilling } from './billing-client';

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

describe('changePlan', () => {
  it('posts the plan and parses the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...state, plan: 'free', downgradedWebsites: ['w1'] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(changePlan('free')).resolves.toMatchObject({ downgradedWebsites: ['w1'] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/billing/plan'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan: 'free' }) }),
    );
  });
});
