import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WORKER_ENV } from '../../config/worker-config.module';

/**
 * The one Redis connection every BullMQ queue and worker in this process shares.
 *
 * Handed connection *options*, BullMQ opens a connection per queue and two per worker, which came
 * to about 29 across the api and worker — and twice that while a deploy overlaps the old instance
 * with the new one, past what a small hosted Redis allows (Render's free tier: 50). Handed this
 * instance instead, queues reuse it and each worker adds only the blocking connection it needs.
 *
 * BullMQ never closes a connection it was given, so this closes it on shutdown.
 */
@Injectable()
export class QueueConnection implements OnApplicationShutdown {
  readonly client: Redis;

  constructor(
    @Inject(WORKER_ENV) env: WorkerEnv,
    @InjectPinoLogger(QueueConnection.name) private readonly logger: PinoLogger,
  ) {
    // BullMQ blocks on Redis commands and requires retries to be unlimited.
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

    // Unhandled, ioredis' 'error' event would terminate the process on a transient blip.
    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Queue Redis connection error');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
