import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import { loadEnv, workerEnvSchema } from '@wintel/config';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createWorkerApp } from '../src/create-worker';
import { RedisService } from '../src/infrastructure/redis/redis.service';
import {
  EXAMPLE_QUEUE,
  type ExampleJobData,
  exampleResultKey,
} from '../src/queues/example/example.constants';

let app: INestApplicationContext;
let queue: Queue<ExampleJobData>;
let redis: RedisService;

beforeAll(async () => {
  const env = loadEnv(workerEnvSchema, { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'error' });
  app = await createWorkerApp(env);
  await app.init();

  queue = app.get<Queue<ExampleJobData>>(getQueueToken(EXAMPLE_QUEUE));
  redis = app.get(RedisService);

  await queue.drain();
});

afterAll(async () => {
  await app.close();
});

describe('example queue', () => {
  it('processes an enqueued job and records the result in redis', async () => {
    const job = await queue.add('greet', { message: 'foundation works' });

    expect(job.id).toBeDefined();

    const stored = await vi.waitFor(
      async () => {
        const value = await redis.client.get(exampleResultKey(job.id as string));
        if (value === null) {
          throw new Error('result not written yet');
        }
        return value;
      },
      { timeout: 15_000, interval: 100 },
    );

    expect(JSON.parse(stored)).toMatchObject({ message: 'foundation works' });
  });

  it('reports the job as completed', async () => {
    const job = await queue.add('greet', { message: 'second job' });

    await vi.waitFor(
      async () => {
        const state = await job.getState();
        if (state !== 'completed') {
          throw new Error(`job is ${state}`);
        }
      },
      { timeout: 15_000, interval: 100 },
    );

    const state = await job.getState();

    expect(state).toBe('completed');
  });
});
