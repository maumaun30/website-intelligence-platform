import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { BillingService } from './billing.service';

const repo = (overrides: Partial<Record<string, unknown>> = {}) => ({
  plan: vi.fn().mockResolvedValue('pro'),
  countWebsites: vi.fn().mockResolvedValue(0),
  countExplanationsSince: vi.fn().mockResolvedValue(0),
  listWebsiteFrequencies: vi.fn().mockResolvedValue([]),
  applyPlanChange: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('BillingService.state', () => {
  it('reports the plan, its limits, and current usage', async () => {
    const dependencies = repo({
      countWebsites: vi.fn().mockResolvedValue(3),
      countExplanationsSince: vi.fn().mockResolvedValue(7),
    });
    const service = new BillingService(dependencies as never);

    const state = await service.state('o1', new Date('2026-09-21T10:00:00.000Z'));

    expect(state.plan).toBe('pro');
    expect(state.limits.websites).toBe(10);
    expect(state.usage).toEqual({ websites: 3, aiExplanationsThisMonth: 7 });
    expect(dependencies.countExplanationsSince).toHaveBeenCalledWith(
      'o1',
      new Date('2026-09-01T00:00:00.000Z'),
    );
  });
});

describe('BillingService.changePlan', () => {
  it('resets only the schedules the new plan forbids and reports them', async () => {
    const dependencies = repo({
      plan: vi.fn().mockResolvedValue('free'),
      listWebsiteFrequencies: vi.fn().mockResolvedValue([
        { id: 'a', scanFrequency: 'daily' },
        { id: 'b', scanFrequency: 'manual' },
      ]),
    });
    const service = new BillingService(dependencies as never);

    const result = await service.changePlan('o1', 'free');

    expect(dependencies.applyPlanChange).toHaveBeenCalledWith('o1', 'free', ['a']);
    expect(result.downgradedWebsites).toEqual(['a']);
  });

  it('downgrades no schedules when upgrading', async () => {
    const dependencies = repo({
      listWebsiteFrequencies: vi.fn().mockResolvedValue([{ id: 'a', scanFrequency: 'daily' }]),
    });
    const service = new BillingService(dependencies as never);

    const result = await service.changePlan('o1', 'agency');

    expect(dependencies.applyPlanChange).toHaveBeenCalledWith('o1', 'agency', []);
    expect(result.downgradedWebsites).toEqual([]);
  });
});

describe('BillingService quota assertions', () => {
  it('refuses a website over the plan limit with the code and the numbers', async () => {
    const dependencies = repo({
      plan: vi.fn().mockResolvedValue('free'),
      countWebsites: vi.fn().mockResolvedValue(1),
    });
    const service = new BillingService(dependencies as never);

    await expect(service.assertWebsiteQuota('o1')).rejects.toMatchObject({
      response: {
        details: { code: 'PLAN_WEBSITE_LIMIT', limit: 1, current: 1 },
      },
    });
  });

  it('allows a website under the plan limit', async () => {
    const service = new BillingService(
      repo({ countWebsites: vi.fn().mockResolvedValue(2) }) as never,
    );

    await expect(service.assertWebsiteQuota('o1')).resolves.toBeUndefined();
  });

  it('refuses a scan frequency the plan does not include', async () => {
    const service = new BillingService(repo({ plan: vi.fn().mockResolvedValue('free') }) as never);

    await expect(service.assertScanFrequency('o1', 'daily')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.assertScanFrequency('o1', 'manual')).resolves.toBeUndefined();
  });

  it('distinguishes a locked AI plan from an exhausted one', async () => {
    const locked = new BillingService(repo({ plan: vi.fn().mockResolvedValue('free') }) as never);
    await expect(locked.assertAiQuota('o1')).rejects.toMatchObject({
      response: { details: { code: 'PLAN_AI_LOCKED' } },
    });

    const exhausted = new BillingService(
      repo({ countExplanationsSince: vi.fn().mockResolvedValue(100) }) as never,
    );
    await expect(exhausted.assertAiQuota('o1')).rejects.toMatchObject({
      response: { details: { code: 'PLAN_AI_LIMIT', limit: 100, current: 100 } },
    });
  });
});
