import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import { createPrismaClient, type PrismaClient } from '@wintel/database';

import { WORKER_ENV } from '../../config/worker-config.module';

/** Owns the worker's Prisma client lifecycle. Mirrors the API's PrismaService by composition. */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
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
