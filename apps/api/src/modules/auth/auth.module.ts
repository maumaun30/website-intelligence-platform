import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import { EMAIL_QUEUE } from '@wintel/types';

import { API_ENV } from '../../config/api-config.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type Auth, createAuth } from './create-auth';
import { EmailQueueService } from './email-queue.service';

/** Injection token for the configured Better Auth server instance. */
export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE');

/**
 * Wires Better Auth into the application: the BullMQ connection and email queue it enqueues onto,
 * and the auth instance itself, built from validated config and the Prisma client. Global so the
 * auth controller and the session/roles guards can inject the instance anywhere.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => ({
        connection: {
          url: env.REDIS_URL,
          // BullMQ blocks on Redis commands and requires retries to be unlimited.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  providers: [
    EmailQueueService,
    {
      provide: AUTH_INSTANCE,
      inject: [API_ENV, PrismaService, EmailQueueService],
      useFactory: (env: ApiEnv, prisma: PrismaService, emailQueue: EmailQueueService): Auth =>
        createAuth({
          env,
          prisma: prisma.client,
          enqueueEmail: (job) => emailQueue.enqueue(job),
        }),
    },
  ],
  exports: [AUTH_INSTANCE, EmailQueueService],
})
export class AuthModule {}
