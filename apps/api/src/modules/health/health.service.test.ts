import { describe, expect, it, vi } from 'vitest';

import { HealthService } from './health.service';

function buildService(options: { databaseFails?: boolean; redisFails?: boolean } = {}) {
  const prisma = {
    client: {
      $queryRaw: vi.fn(() =>
        options.databaseFails
          ? Promise.reject(new Error('connection refused'))
          : Promise.resolve([{ ok: 1 }]),
      ),
    },
  };
  const redis = {
    client: {
      ping: vi.fn(() =>
        options.redisFails ? Promise.reject(new Error('LOADING')) : Promise.resolve('PONG'),
      ),
    },
  };

  return new HealthService(
    prisma as unknown as ConstructorParameters<typeof HealthService>[0],
    redis as unknown as ConstructorParameters<typeof HealthService>[1],
  );
}

describe('HealthService', () => {
  it('reports ok when every dependency answers', async () => {
    const result = await buildService().check();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.redis.status).toBe('up');
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports degraded and names the failing dependency when the database is down', async () => {
    const result = await buildService({ databaseFails: true }).check();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('down');
    expect(result.checks.database.error).toBe('connection refused');
    expect(result.checks.redis.status).toBe('up');
  });

  it('reports degraded when Redis is down', async () => {
    const result = await buildService({ redisFails: true }).check();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis.status).toBe('down');
  });

  it('probes dependencies concurrently rather than in sequence', async () => {
    const service = buildService({ databaseFails: true });

    const result = await service.check();

    // Both probes must still have run even though the first one rejected.
    expect(result.checks.redis.status).toBe('up');
  });
});
