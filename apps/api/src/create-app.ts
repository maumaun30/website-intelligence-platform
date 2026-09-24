import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ApiEnv } from '@wintel/config';
import { toNodeHandler } from 'better-auth/node';
import { json, raw } from 'express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AUTH_INSTANCE } from './modules/auth/auth.module';
import type { Auth } from './modules/auth/create-auth';

export async function createApiApp(env: ApiEnv): Promise<INestApplication> {
  // Better Auth reads the raw request stream, so its handler must run before any body parser
  // consumes it. Nest's default parser is therefore disabled and re-applied below for the
  // routes that need it — the auth handler terminates its own requests, so JSON parsing never
  // runs for them.
  const app = await NestFactory.create(AppModule.forEnv(env), {
    bufferLogs: true,
    bodyParser: false,
  });

  app.useLogger(app.get(Logger));
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });

  const auth = app.get<Auth>(AUTH_INSTANCE);
  app.use('/api/v1/auth', toNodeHandler(auth));
  // Stripe signs the exact bytes it sends, so this one route must not be JSON-parsed: it needs
  // the raw Buffer body, mounted here for the same reason auth runs before json() above.
  app.use('/api/v1/billing/webhook', raw({ type: 'application/json' }));
  app.use(json());

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  // Lets Nest run onModuleDestroy on SIGTERM so Prisma and Redis close cleanly on deploy.
  app.enableShutdownHooks();

  return app;
}
