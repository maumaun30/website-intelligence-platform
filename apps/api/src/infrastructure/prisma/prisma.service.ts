import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import { createPrismaClient, type PrismaClient } from '@wintel/database';

import { API_ENV } from '../../config/api-config.module';

/**
 * Owns the Prisma client lifecycle.
 *
 * Composition rather than `extends PrismaClient`: the service is free to grow transaction
 * helpers and instrumentation without those leaking onto the client's own surface, and
 * consumers depend on this class rather than on Prisma directly.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = createPrismaClient({
      databaseUrl: env.DATABASE_URL,
      logQueries: env.NODE_ENV === 'development',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
