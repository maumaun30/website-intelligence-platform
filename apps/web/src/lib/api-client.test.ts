import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, fetchHealth } from './api-client';

const healthyBody = {
  status: 'ok',
  uptimeSeconds: 12,
  version: '0.1.0',
  checks: {
    database: { status: 'up', latencyMs: 2 },
    redis: { status: 'up', latencyMs: 1 },
  },
};

function mockFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('returns the parsed health response', async () => {
    mockFetch(healthyBody);

    await expect(fetchHealth()).resolves.toEqual(healthyBody);
  });

  it('returns the body of a 503 degraded response rather than throwing', async () => {
    const degradedBody = {
      ...healthyBody,
      status: 'degraded',
      checks: {
        database: { status: 'down', latencyMs: 2000, error: 'connection refused' },
        redis: { status: 'up', latencyMs: 1 },
      },
    };
    mockFetch(degradedBody, 503);

    const result = await fetchHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.error).toBe('connection refused');
  });

  it('throws ApiError when the body does not match the shared contract', async () => {
    mockFetch({ status: 'fine' }, 200);

    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError when the response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>502</html>', { status: 502 }))),
    );

    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiError);
  });
});
