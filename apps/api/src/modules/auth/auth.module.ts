import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import { EMAIL_QUEUE } from '@wintel/types';

import { API_ENV } from '../../config/api-config.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AUTH_INSTANCE } from './auth.tokens';
import { type Auth, createAuth } from './create-auth';
import { EmailQueueService } from './email-queue.service';
import { MeController } from './me.controller';
import { RolesGuard } from './roles.guard';
import { SessionGuard } from './session.guard';

export { AUTH_INSTANCE } from './auth.tokens';

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
  controllers: [MeController],
  providers: [
    EmailQueueService,
    SessionGuard,
    RolesGuard,
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
  exports: [AUTH_INSTANCE, EmailQueueService, SessionGuard, RolesGuard],
})
export class AuthModule {}
