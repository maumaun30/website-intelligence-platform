import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ApiEnv } from '@wintel/config';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export async function createApiApp(env: ApiEnv): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forEnv(env), { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  // Lets Nest run onModuleDestroy on SIGTERM so Prisma and Redis close cleanly on deploy.
  app.enableShutdownHooks();

  return app;
}
