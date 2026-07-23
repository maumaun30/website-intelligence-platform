import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';

export const WORKER_ENV = Symbol('WORKER_ENV');

@Global()
@Module({})
export class WorkerConfigModule {
  static forRoot(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerConfigModule,
      providers: [{ provide: WORKER_ENV, useValue: env }],
      exports: [WORKER_ENV],
    };
  }
}
