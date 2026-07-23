import { randomUUID } from 'node:crypto';

import { apiEnvSchema, loadEnv } from '@wintel/config';
import { createPrismaClient, type PrismaClient } from '@wintel/database';
import type { EmailJob } from '@wintel/types';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type Auth, createAuth } from './create-auth';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the auth integration tests.');
}

let prisma: PrismaClient;
let auth: Auth;
let enqueued: EmailJob[];
const createdEmails: string[] = [];

beforeAll(() => {
  const env = loadEnv(apiEnvSchema, {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? 'test-secret-that-is-at-least-32-characters-long',
  });

  prisma = createPrismaClient({ databaseUrl });
  enqueued = [];
  auth = createAuth({
    env,
    prisma,
    enqueueEmail: async (job) => {
      enqueued.push(job);
    },
  });
});

afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const organizationIds = (
    await prisma.member.findMany({ where: { userId: { in: users.map((u) => u.id) } } })
  ).map((member) => member.organizationId);

  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  enqueued.length = 0;
  createdEmails.length = 0;
});

describe('createAuth', () => {
  it('creates a personal organization the new user owns and enqueues a verification email', async () => {
    const email = `signup-${randomUUID().slice(0, 8)}@wintel.test`;
    createdEmails.push(email);

    await auth.api.signUpEmail({
      body: { name: 'Ada Lovelace', email, password: 'correct-horse-battery' },
    });

    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    const members = await prisma.member.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });

    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');
    expect(members[0]?.organization.name).toBe("Ada Lovelace's Organization");

    const verification = enqueued.find((job) => job.type === 'verification');
    expect(verification).toBeDefined();
    expect(verification).toMatchObject({ type: 'verification', to: email });
  });
});
