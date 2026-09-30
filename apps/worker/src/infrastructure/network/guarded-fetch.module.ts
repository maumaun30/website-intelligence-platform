import { Global, Module } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';

import { WORKER_ENV } from '../../config/worker-config.module';
import { createGuardedFetch } from './guarded-fetch';

export const GUARDED_FETCH = Symbol('GUARDED_FETCH');

/**
 * One guarded `fetch` for every outbound request the worker makes on a user's behalf. Global so
 * crawling and verification share it and no new call site can quietly skip the check.
 */
@Global()
@Module({
  providers: [
    {
      provide: GUARDED_FETCH,
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv): typeof fetch =>
        createGuardedFetch({ allowPrivateTargets: env.ALLOW_PRIVATE_SCAN_TARGETS }),
    },
  ],
  exports: [GUARDED_FETCH],
})
export class GuardedFetchModule {}
