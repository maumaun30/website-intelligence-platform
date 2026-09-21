import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { apiEnvSchema, loadEnv } from '@wintel/config';
import { createPrismaClient, type PrismaClient } from '@wintel/database';
import {
  EXPLAIN_ISSUE_QUEUE,
  SCAN_AUDIT_QUEUE,
  WEBSITE_CRAWL_QUEUE,
  healthCheckResponseSchema,
} from '@wintel/types';
import type { Queue } from 'bullmq';
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

describe('websites', () => {
  it('rejects an unauthenticated list with 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/websites');

    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated create with 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/websites')
      .send({ name: 'Acme', url: 'https://acme.test' });

    expect(response.status).toBe(401);
  });
});

describe('scans', () => {
  let prisma: PrismaClient;
  let cookie: string;
  let websiteId: string;
  let scanId: string;

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
    const email = `scan-e2e-${Date.now()}@example.test`;
    const password = 'scan-e2e-password-1234';
    const origin = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';

    await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', origin)
      .send({ email, password, name: 'Scan E2E' })
      .expect(200);
    await prisma.user.update({ where: { email }, data: { emailVerified: true } });

    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    cookie = ([] as string[]).concat(signIn.headers['set-cookie'] ?? []).join('; ');

    const created = await request(app.getHttpServer())
      .post('/api/v1/websites')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ name: 'Scan target', url: `https://scan-e2e-${Date.now()}.test` })
      .expect(201);
    websiteId = created.body.id;
  });

  afterAll(async () => {
    await app.get<Queue>(getQueueToken(WEBSITE_CRAWL_QUEUE)).obliterate({ force: true });
    await app.get<Queue>(getQueueToken(SCAN_AUDIT_QUEUE)).obliterate({ force: true });
    await app.get<Queue>(getQueueToken(EXPLAIN_ISSUE_QUEUE)).obliterate({ force: true });
    await prisma.$disconnect();
  });

  it('rejects an unauthenticated scan start with 401', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/websites/any/scans');

    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated scan read with 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/scans/any');

    expect(response.status).toBe(401);
  });

  it('refuses to scan an unverified website with 409', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/websites/${websiteId}/scans`)
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.details).toEqual({ code: 'WEBSITE_NOT_VERIFIED' });
  });

  it('starts a scan on a verified website, then refuses a concurrent one', async () => {
    await prisma.website.update({
      where: { id: websiteId },
      data: { verificationStatus: 'verified' },
    });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/websites/${websiteId}/scans`)
      .set('Cookie', cookie);
    expect(first.status).toBe(202);
    expect(first.body.status).toBe('queued');
    scanId = first.body.id;

    const second = await request(app.getHttpServer())
      .post(`/api/v1/websites/${websiteId}/scans`)
      .set('Cookie', cookie);
    expect(second.status).toBe(409);
    expect(second.body.details).toEqual({ code: 'SCAN_IN_PROGRESS' });

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/websites/${websiteId}/scans`)
      .set('Cookie', cookie);
    expect(listed.status).toBe(200);
    expect(listed.body[0].id).toBe(first.body.id);

    const pages = await request(app.getHttpServer())
      .get(`/api/v1/scans/${first.body.id}/pages?limit=10`)
      .set('Cookie', cookie);
    expect(pages.status).toBe(200);
    expect(pages.body).toEqual({ items: [], total: 0, limit: 10, offset: 0 });
  });

  it('rejects an out-of-range page limit with 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/scans/any/pages?limit=500')
      .set('Cookie', cookie);

    expect(response.status).toBe(400);
  });

  it('serves the audit rule catalog to members', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-rules')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(15);
  });

  it('rejects an unauthenticated audit read with 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/audit-rules');

    expect(response.status).toBe(401);
  });

  it('404s the audit of a scan that has none', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/scans/${scanId}/audit`)
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
  });

  it('refuses to re-run the audit of a scan that has not completed', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/scans/${scanId}/audit`)
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.details).toEqual({ code: 'SCAN_NOT_COMPLETED' });
  });

  it('schedules and unschedules scans when the frequency changes', async () => {
    const daily = await request(app.getHttpServer())
      .patch(`/api/v1/websites/${websiteId}`)
      .set('Cookie', cookie)
      .send({ scanFrequency: 'daily' });
    expect(daily.status).toBe(200);
    expect(typeof daily.body.nextScanAt).toBe('string');

    const manual = await request(app.getHttpServer())
      .patch(`/api/v1/websites/${websiteId}`)
      .set('Cookie', cookie)
      .send({ scanFrequency: 'manual' });
    expect(manual.body.nextScanAt).toBeNull();
  });

  it('serves the overview and a website trend to members', async () => {
    const overview = await request(app.getHttpServer())
      .get('/api/v1/overview')
      .set('Cookie', cookie);
    expect(overview.status).toBe(200);
    expect(overview.body.map((row: { websiteId: string }) => row.websiteId)).toContain(websiteId);

    const trend = await request(app.getHttpServer())
      .get(`/api/v1/websites/${websiteId}/trend`)
      .set('Cookie', cookie);
    expect(trend.status).toBe(200);
    expect(trend.body).toEqual([]);
  });

  it('404s changes of a scan without an audit and 401s the overview anonymously', async () => {
    const changes = await request(app.getHttpServer())
      .get(`/api/v1/scans/${scanId}/changes`)
      .set('Cookie', cookie);
    expect(changes.status).toBe(404);

    expect((await request(app.getHttpServer()).get('/api/v1/overview')).status).toBe(401);
  });

  it('reports AI explanations as unavailable when disabled, and 401s anonymous requests', async () => {
    const anonymous = await request(app.getHttpServer())
      .post(`/api/v1/scans/${scanId}/audit/explanations`)
      .send({ ruleId: 'missing-h1' });
    expect(anonymous.status).toBe(401);

    const disabled = await request(app.getHttpServer())
      .post(`/api/v1/scans/${scanId}/audit/explanations`)
      .set('Cookie', cookie)
      .send({ ruleId: 'missing-h1' });
    expect(disabled.status).toBe(503);
    expect(disabled.body.details).toEqual({ code: 'AI_UNAVAILABLE' });
  });
});

describe('billing', () => {
  it('rejects an unauthenticated billing read with 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/billing');

    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated plan change with 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/billing/plan')
      .send({ plan: 'pro' });

    expect(response.status).toBe(401);
  });
});
