import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import Redis from 'ioredis';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';

import { API_ENV } from '../../config/api-config.module';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger,
  ) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

    // ioredis emits 'error' on every failed reconnection attempt. An unhandled 'error' event
    // on an EventEmitter terminates the process, so a transient Redis blip would take the whole
    // API down. Log it instead and let the health endpoint report the degradation.
    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Redis connection error');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
