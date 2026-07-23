import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import { LoggerModule } from 'nestjs-pino';

import { WorkerConfigModule } from './config/worker-config.module';
import { MailerModule } from './infrastructure/mailer/mailer.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { EmailModule } from './queues/email/email.module';
import { ExampleModule } from './queues/example/example.module';

@Module({})
export class WorkerModule {
  static forEnv(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        WorkerConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
                : undefined,
          },
        }),
        BullModule.forRoot({
          connection: {
            url: env.REDIS_URL,
            // BullMQ blocks on Redis commands and requires retries to be unlimited; any other
            // value makes long-lived workers throw during normal blocking reads.
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 3_600, count: 1_000 },
            removeOnFail: { age: 24 * 3_600 },
          },
        }),
        RedisModule,
        MailerModule,
        EmailModule,
        ExampleModule,
      ],
    };
  }
}
