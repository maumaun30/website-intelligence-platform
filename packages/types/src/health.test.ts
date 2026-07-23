import { describe, expect, it } from 'vitest';

import { healthCheckResponseSchema } from './health';

const healthyPayload = {
  status: 'ok',
  uptimeSeconds: 42,
  version: '0.1.0',
  checks: {
    database: { status: 'up', latencyMs: 3 },
    redis: { status: 'up', latencyMs: 1 },
  },
};

describe('healthCheckResponseSchema', () => {
  it('accepts a healthy payload', () => {
    const result = healthCheckResponseSchema.safeParse(healthyPayload);

    expect(result.success).toBe(true);
  });

  it('accepts a degraded payload carrying an error string', () => {
    const result = healthCheckResponseSchema.safeParse({
      ...healthyPayload,
      status: 'degraded',
      checks: {
        database: { status: 'down', latencyMs: 2001, error: 'connection refused' },
        redis: { status: 'up', latencyMs: 1 },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown overall status', () => {
    const result = healthCheckResponseSchema.safeParse({ ...healthyPayload, status: 'fine' });

    expect(result.success).toBe(false);
  });

  it('rejects a payload missing a dependency check', () => {
    const result = healthCheckResponseSchema.safeParse({
      ...healthyPayload,
      checks: { database: { status: 'up', latencyMs: 3 } },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative latency', () => {
    const result = healthCheckResponseSchema.safeParse({
      ...healthyPayload,
      checks: {
        database: { status: 'up', latencyMs: -1 },
        redis: { status: 'up', latencyMs: 1 },
      },
    });

    expect(result.success).toBe(false);
  });
});
