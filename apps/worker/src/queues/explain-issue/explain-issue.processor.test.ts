import { randomUUID } from 'node:crypto';

import { createPrismaClient, type PrismaClient } from '@wintel/database';
import type { OrganizationPlan } from '@wintel/types';
import { UnrecoverableError, type Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ExplanationInput } from './explanation-input';
import { ExplainIssueProcessor } from './explain-issue.processor';
import { ExplanationRefusedError } from './generator';

let prisma: PrismaClient;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const input = { pages: [] } as unknown as ExplanationInput;
const buildInput = vi.fn().mockResolvedValue(input);

async function seedExplanation(options: { plan?: OrganizationPlan; priorCompleted?: number } = {}) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: 'U', email: `${userId}@example.com`, emailVerified: true },
  });
  await prisma.organization.create({
    data: {
      id: organizationId,
      name: 'O',
      slug: `o-${organizationId.slice(0, 8)}`,
      // 'pro' by default so pre-existing tests (unrelated to the quota re-check) still call the
      // model; the quota test overrides both the plan and how many completed rows already exist.
      plan: options.plan ?? 'pro',
    },
  });
  const website = await prisma.website.create({
    data: {
      organizationId,
      createdById: userId,
      name: 'X',
      url: 'https://x.test',
      domain: `x-${randomUUID().slice(0, 8)}.test`,
      verificationToken: 't',
    },
  });
  const scan = await prisma.scan.create({
    data: { websiteId: website.id, organizationId, status: 'completed' },
  });
  const audit = await prisma.audit.create({
    data: { scanId: scan.id, organizationId, status: 'completed' },
  });
  const priorCompleted = options.priorCompleted ?? 0;
  if (priorCompleted > 0) {
    await prisma.explanation.createMany({
      data: Array.from({ length: priorCompleted }, (_, i) => ({
        auditId: audit.id,
        ruleId: `prior-rule-${i}`,
        organizationId,
        status: 'completed' as const,
      })),
    });
  }
  return prisma.explanation.create({
    data: { auditId: audit.id, ruleId: 'missing-h1', organizationId },
  });
}

function job(explanationId: string, attemptsMade = 0) {
  return { data: { explanationId }, attemptsMade, opts: { attempts: 2 } } as unknown as Job;
}

function processor(generate: ReturnType<typeof vi.fn>) {
  return new ExplainIssueProcessor(
    { client: prisma } as never,
    { generate } as never,
    buildInput,
    logger as never,
  );
}

const generated = {
  model: 'claude-opus-5',
  usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 },
  content: { summary: 's', whyItMatters: 'w', fixes: [], generalAdvice: [] },
};

beforeAll(() => {
  prisma = createPrismaClient({ databaseUrl: process.env.DATABASE_URL ?? '' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ExplainIssueProcessor', () => {
  it('stores content, model and usage', async () => {
    const explanation = await seedExplanation();

    await processor(vi.fn().mockResolvedValue(generated)).process(job(explanation.id));

    const stored = await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } });
    expect(stored).toMatchObject({
      status: 'completed',
      model: 'claude-opus-5',
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 5,
      content: generated.content,
      error: null,
    });
  });

  it('fails a refusal without retrying', async () => {
    const explanation = await seedExplanation();

    await expect(
      processor(vi.fn().mockRejectedValue(new ExplanationRefusedError())).process(
        job(explanation.id),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const stored = await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } });
    expect(stored).toMatchObject({
      status: 'failed',
      error: 'The model declined to explain this rule',
    });
  });

  it('requeues a retryable error, then fails it on the final attempt', async () => {
    const explanation = await seedExplanation();
    const overloaded = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(processor(overloaded).process(job(explanation.id, 0))).rejects.toThrow(
      'overloaded',
    );
    expect(
      (await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } })).status,
    ).toBe('queued');

    await expect(processor(overloaded).process(job(explanation.id, 1))).rejects.toThrow(
      'overloaded',
    );
    expect(
      await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } }),
    ).toMatchObject({
      status: 'failed',
      error: 'overloaded',
    });
  });

  it('skips an explanation that is not queued', async () => {
    const explanation = await seedExplanation();
    await prisma.explanation.update({
      where: { id: explanation.id },
      data: { status: 'completed' },
    });
    const generate = vi.fn();

    await processor(generate).process(job(explanation.id));

    expect(generate).not.toHaveBeenCalled();
  });

  it('fails a job whose organization is over its monthly AI quota, without calling the model', async () => {
    const explanation = await seedExplanation({ plan: 'pro', priorCompleted: 100 });
    const generate = vi.fn();

    await expect(processor(generate).process(job(explanation.id))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(generate).not.toHaveBeenCalled();
    const stored = await prisma.explanation.findUniqueOrThrow({ where: { id: explanation.id } });
    expect(stored).toMatchObject({ status: 'failed', error: 'PLAN_AI_LIMIT' });
  });
});
