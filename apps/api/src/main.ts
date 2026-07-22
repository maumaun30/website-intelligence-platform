import 'reflect-metadata';

import { apiEnvSchema, EnvValidationError, loadDotenv, loadEnv } from '@wintel/config';

import { createApiApp } from './create-app';

async function bootstrap(): Promise<void> {
  loadDotenv(['.env', '../../.env']);

  const env = loadEnv(apiEnvSchema);
  const app = await createApiApp(env);

  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  // Configuration errors are the operator's problem and already carry a complete message;
  // anything else is a genuine crash and deserves the full stack.
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('API failed to start', error);
  }

  process.exit(1);
});
