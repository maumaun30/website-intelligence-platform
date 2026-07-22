import { Injectable } from '@nestjs/common';
import type { DependencyCheck, HealthCheckResponse } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { APP_VERSION } from '../../version';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Probes every dependency concurrently and reports each one individually.
   *
   * A single boolean would tell an operator that something is wrong but not what; naming the
   * failing dependency and its latency is the difference between a page and a fix.
   */
  async check(): Promise<HealthCheckResponse> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.prisma.client.$queryRaw`SELECT 1`),
      this.probe(() => this.redis.client.ping()),
    ]);

    return {
      status: database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      version: APP_VERSION,
      checks: { database, redis },
    };
  }

  private async probe(run: () => Promise<unknown>): Promise<DependencyCheck> {
    const startedAt = Date.now();

    try {
      await run();
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
