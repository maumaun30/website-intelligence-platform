import type { INestApplication } from '@nestjs/common';
import { apiEnvSchema, loadEnv } from '@wintel/config';
import { healthCheckResponseSchema } from '@wintel/types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp } from '../src/create-app';

let app: INestApplication;

beforeAll(async () => {
  const env = loadEnv(apiEnvSchema, {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? 'test-secret-that-is-at-least-32-characters-long',
  });
  app = await createApiApp(env);
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/health', () => {
  it('returns 200 with every dependency up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('returns a body matching the shared health contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    const parsed = healthCheckResponseSchema.safeParse(response.body);

    expect(parsed.success).toBe(true);
  });

  it('echoes a request id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'test-request-id');

    expect(response.headers['x-request-id']).toBe('test-request-id');
  });
});

describe('error shaping', () => {
  it('returns the standard error body for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    expect(typeof response.body.requestId).toBe('string');
  });

  it('serves routes only under the version prefix', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(404);
  });
});

describe('authentication', () => {
  it('rejects an unauthenticated request to a protected route with 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me');

    expect(response.status).toBe(401);
  });

  it('mounts the Better Auth handler under the version prefix', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/get-session');

    // No cookie means no session, but the handler answers (200 with an empty body) rather than
    // falling through to Nest's 404 — proving it is mounted at the right path.
    expect(response.status).toBe(200);
  });
});
