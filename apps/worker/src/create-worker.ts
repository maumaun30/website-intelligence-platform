import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { WorkerEnv } from '@wintel/config';
import { Logger } from 'nestjs-pino';

import { WorkerModule } from './worker.module';

/**
 * Builds the worker as a standalone application context: it consumes jobs and serves no HTTP.
 * Shared by `main.ts` and the e2e suite so tests exercise production wiring.
 */
export async function createWorkerApp(env: WorkerEnv): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(WorkerModule.forEnv(env), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  // On SIGTERM Nest destroys modules, which closes the BullMQ workers. BullMQ finishes the job
  // it is holding before closing, so a deploy never abandons work mid-flight.
  app.enableShutdownHooks();

  return app;
}
