import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';

/** Injection token for the validated API environment. */
export const API_ENV = Symbol('API_ENV');

/**
 * Makes the already-validated environment injectable.
 *
 * Validation happens once, at process start, before Nest is constructed — so by the time any
 * provider receives `API_ENV` the configuration is known good and fully typed. No provider
 * reads `process.env` directly.
 */
@Global()
@Module({})
export class ApiConfigModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: ApiConfigModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
