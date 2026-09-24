import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { BillingService } from './billing.service';

const repo = (overrides: Partial<Record<string, unknown>> = {}) => ({
  plan: vi.fn().mockResolvedValue('pro'),
  countWebsites: vi.fn().mockResolvedValue(0),
  aiUsage: vi.fn().mockResolvedValue(0),
  incrementAiUsageBelow: vi.fn().mockResolvedValue(true),
  listWebsiteFrequencies: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const subscriptionsRepo = (overrides: Partial<Record<string, unknown>> = {}) => ({
  find: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe('BillingService.state', () => {
  it('reports the plan, its limits, and current usage', async () => {
    const dependencies = repo({
      countWebsites: vi.fn().mockResolvedValue(3),
      aiUsage: vi.fn().mockResolvedValue(7),
    });
    const service = new BillingService(dependencies as never, subscriptionsRepo() as never);

    const state = await service.state('o1', new Date('2026-09-21T10:00:00.000Z'));

    expect(state.plan).toBe('pro');
    expect(state.limits.websites).toBe(10);
    expect(state.usage).toEqual({ websites: 3, aiExplanationsThisMonth: 7 });
    expect(dependencies.aiUsage).toHaveBeenCalledWith('o1', '2026-09');
  });

  it('reports no subscription when there is no row', async () => {
    const service = new BillingService(repo() as never, subscriptionsRepo() as never);

    const state = await service.state('o1', new Date('2026-09-21T10:00:00.000Z'));

    expect(state.subscription).toBeNull();
  });

  it('reports the subscription summary when a row exists', async () => {
    const service = new BillingService(
      repo() as never,
      subscriptionsRepo({
        find: vi.fn().mockResolvedValue({
          status: 'active',
          currentPeriodEnd: new Date('2026-10-21T00:00:00.000Z'),
          cancelAtPeriodEnd: true,
        }),
      }) as never,
    );

    const state = await service.state('o1', new Date('2026-09-21T10:00:00.000Z'));

    expect(state.subscription).toEqual({
      status: 'active',
      currentPeriodEnd: '2026-10-21T00:00:00.000Z',
      cancelAtPeriodEnd: true,
    });
  });
});

describe('BillingService quota assertions', () => {
  it('refuses a scan frequency the plan does not include', async () => {
    const service = new BillingService(
      repo({ plan: vi.fn().mockResolvedValue('free') }) as never,
      subscriptionsRepo() as never,
    );

    await expect(service.assertScanFrequency('o1', 'daily')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.assertScanFrequency('o1', 'manual')).resolves.toBeUndefined();
  });

  it('refuses a locked AI plan without touching the counter', async () => {
    const dependencies = repo({ plan: vi.fn().mockResolvedValue('free') });
    const service = new BillingService(dependencies as never, subscriptionsRepo() as never);

    await expect(service.consumeAiQuota('o1')).rejects.toMatchObject({
      response: { details: { code: 'PLAN_AI_LOCKED' } },
    });
    expect(dependencies.incrementAiUsageBelow).not.toHaveBeenCalled();
  });

  it('consumes one unit of the current month when under the limit', async () => {
    const dependencies = repo();
    const service = new BillingService(dependencies as never, subscriptionsRepo() as never);

    await expect(
      service.consumeAiQuota('o1', new Date('2026-09-21T10:00:00.000Z')),
    ).resolves.toBeUndefined();
    expect(dependencies.incrementAiUsageBelow).toHaveBeenCalledWith('o1', '2026-09', 100);
  });

  it('refuses at the limit with the numbers read after the refusal', async () => {
    const dependencies = repo({
      incrementAiUsageBelow: vi.fn().mockResolvedValue(false),
      aiUsage: vi.fn().mockResolvedValue(100),
    });
    const service = new BillingService(dependencies as never, subscriptionsRepo() as never);

    await expect(
      service.consumeAiQuota('o1', new Date('2026-09-21T10:00:00.000Z')),
    ).rejects.toMatchObject({
      response: { details: { code: 'PLAN_AI_LIMIT', limit: 100, current: 100 } },
    });
    expect(dependencies.aiUsage).toHaveBeenCalledWith('o1', '2026-09');
  });
});
