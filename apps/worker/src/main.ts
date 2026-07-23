import 'reflect-metadata';

import { EnvValidationError, loadDotenv, loadEnv, workerEnvSchema } from '@wintel/config';

import { createWorkerApp } from './create-worker';

async function bootstrap(): Promise<void> {
  loadDotenv(['.env', '../../.env']);

  const env = loadEnv(workerEnvSchema);
  const app = await createWorkerApp(env);

  await app.init();
}

bootstrap().catch((error: unknown) => {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('Worker failed to start', error);
  }

  process.exit(1);
});
