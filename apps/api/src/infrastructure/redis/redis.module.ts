import { Global, Module } from '@nestjs/common';

import { QueueConnection } from './queue-connection';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, QueueConnection],
  exports: [RedisService, QueueConnection],
})
export class RedisModule {}
