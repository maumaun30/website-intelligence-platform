import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WORKER_ENV } from '../../config/worker-config.module';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(
    @Inject(WORKER_ENV) env: WorkerEnv,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger,
  ) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

    // ioredis emits 'error' on every failed reconnection attempt. An unhandled 'error' event
    // on an EventEmitter terminates the process, so a transient Redis blip would take the whole
    // worker down. Log it instead and let BullMQ's own retries handle recovery.
    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Redis connection error');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
