import {
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AI_DAILY_LIMIT } from '@wintel/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplanationsService } from './explanations.service';

const member = { organizationId: 'o1', userId: 'u1', role: 'member' as const };
const admin = { ...member, role: 'admin' as const };

describe('ExplanationsService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let audits: { findAuditOrThrow: ReturnType<typeof vi.fn> };
  let queue: { enqueue: ReturnType<typeof vi.fn> };
  let enabled: boolean;

  const service = () =>
    new ExplanationsService(
      repo as never,
      audits as never,
      queue as never,
      { AI_EXPLANATIONS_ENABLED: enabled } as never,
    );

  const code = async (promise: Promise<unknown>) => {
    const error = (await promise.catch((caught: unknown) => caught)) as HttpException;
    return (error.getResponse() as { details: { code: string } }).details.code;
  };

  beforeEach(() => {
    enabled = true;
    repo = {
      find: vi.fn().mockResolvedValue(null),
      countIssues: vi.fn().mockResolvedValue(3),
      countRequestedSince: vi.fn().mockResolvedValue(0),
      queue: vi.fn().mockResolvedValue({ id: 'e1', status: 'queued' }),
    };
    audits = { findAuditOrThrow: vi.fn().mockResolvedValue({ id: 'a1', status: 'completed' }) };
    queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  });

  it('queues and enqueues a first explanation', async () => {
    const result = await service().request('s1', member, {
      ruleId: 'missing-h1',
      regenerate: false,
    });

    expect(repo.queue).toHaveBeenCalledWith({
      auditId: 'a1',
      ruleId: 'missing-h1',
      organizationId: 'o1',
      requestedById: 'u1',
    });
    expect(queue.enqueue).toHaveBeenCalledWith({ explanationId: 'e1' });
    expect(result).toEqual({ id: 'e1', status: 'queued' });
  });

  it('refuses when AI is disabled', async () => {
    enabled = false;
    const promise = service().request('s1', member, { ruleId: 'missing-h1', regenerate: false });

    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(
      await code(service().request('s1', member, { ruleId: 'missing-h1', regenerate: false })),
    ).toBe('AI_UNAVAILABLE');
  });

  it('refuses incomplete audits and rules without issues', async () => {
    audits.findAuditOrThrow.mockResolvedValue({ id: 'a1', status: 'running' });
    expect(
      await code(service().request('s1', member, { ruleId: 'missing-h1', regenerate: false })),
    ).toBe('AUDIT_NOT_COMPLETED');

    audits.findAuditOrThrow.mockResolvedValue({ id: 'a1', status: 'completed' });
    repo.countIssues!.mockResolvedValue(0);
    await expect(
      service().request('s1', member, { ruleId: 'missing-h1', regenerate: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await code(service().request('s1', member, { ruleId: 'missing-h1', regenerate: false })),
    ).toBe('NO_ISSUES_FOR_RULE');
  });

  it('returns an existing explanation without spending', async () => {
    repo.find!.mockResolvedValue({ id: 'e0', status: 'completed' });

    expect(
      await service().request('s1', member, { ruleId: 'missing-h1', regenerate: false }),
    ).toEqual({ id: 'e0', status: 'completed' });
    expect(repo.queue).not.toHaveBeenCalled();
    expect(repo.countRequestedSince).not.toHaveBeenCalled();
  });

  it('only lets admins regenerate, and never while one is in progress', async () => {
    repo.find!.mockResolvedValue({ id: 'e0', status: 'completed' });
    await expect(
      service().request('s1', member, { ruleId: 'missing-h1', regenerate: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service().request('s1', admin, { ruleId: 'missing-h1', regenerate: true });
    expect(repo.queue).toHaveBeenCalled();

    repo.queue!.mockClear();
    repo.find!.mockResolvedValue({ id: 'e0', status: 'running' });
    expect(
      await service().request('s1', admin, { ruleId: 'missing-h1', regenerate: true }),
    ).toEqual({ id: 'e0', status: 'running' });
    expect(repo.queue).not.toHaveBeenCalled();
  });

  it('enforces the daily cap from the start of the UTC day', async () => {
    repo.countRequestedSince!.mockResolvedValue(AI_DAILY_LIMIT);
    const now = new Date('2026-09-17T15:30:00.000Z');

    const error = (await service()
      .request('s1', member, { ruleId: 'missing-h1', regenerate: false }, now)
      .catch((caught: unknown) => caught)) as HttpException;

    expect(error.getStatus()).toBe(429);
    expect(repo.countRequestedSince).toHaveBeenCalledWith(
      'o1',
      new Date('2026-09-17T00:00:00.000Z'),
    );
  });
});
