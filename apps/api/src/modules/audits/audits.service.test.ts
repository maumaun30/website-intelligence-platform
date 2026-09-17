import { ConflictException, NotFoundException } from '@nestjs/common';
import { AUDIT_STALE_MS } from '@wintel/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditsService } from './audits.service';

const now = new Date('2026-09-17T12:00:00.000Z');
const scan = { id: 's1', websiteId: 'w1', status: 'completed' };

describe('AuditsService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let scans: { getOrThrow: ReturnType<typeof vi.fn> };
  let queue: { enqueue: ReturnType<typeof vi.fn> };
  let service: AuditsService;

  beforeEach(() => {
    repo = {
      findByScan: vi.fn().mockResolvedValue(null),
      ruleCounts: vi.fn().mockResolvedValue([]),
      listIssues: vi.fn(),
      latestCompletedScanId: vi.fn().mockResolvedValue('s1'),
      requeue: vi.fn().mockResolvedValue({ id: 'a1', scanId: 's1', status: 'queued' }),
      listChanges: vi.fn(),
    };
    scans = { getOrThrow: vi.fn().mockResolvedValue(scan) };
    queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    service = new AuditsService(repo as never, scans as never, queue as never);
  });

  const codeOf = async (promise: Promise<unknown>) => {
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    return ((error as ConflictException).getResponse() as { details: { code: string } }).details
      .code;
  };

  it('returns the audit with rule counts', async () => {
    repo.findByScan!.mockResolvedValue({ id: 'a1' });
    repo.ruleCounts!.mockResolvedValue([{ ruleId: 'missing-h1', severity: 'warning', count: 2 }]);

    expect(await service.getForScan('s1', 'o1')).toEqual({
      id: 'a1',
      ruleCounts: [{ ruleId: 'missing-h1', severity: 'warning', count: 2 }],
    });
  });

  it('404s a scan without an audit', async () => {
    await expect(service.getForScan('s1', 'o1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists issues with pagination echoed', async () => {
    repo.findByScan!.mockResolvedValue({ id: 'a1' });
    repo.listIssues!.mockResolvedValue({ items: [], total: 0 });

    const result = await service.listIssues('s1', 'o1', {
      ruleId: 'missing-h1',
      limit: 10,
      offset: 5,
    });

    expect(repo.listIssues).toHaveBeenCalledWith('a1', { ruleId: 'missing-h1' }, 10, 5);
    expect(result).toEqual({ items: [], total: 0, limit: 10, offset: 5 });
  });

  it('re-runs the audit of the latest completed scan', async () => {
    const audit = await service.rerun('s1', 'o1', now);

    expect(repo.requeue).toHaveBeenCalledWith('s1', 'o1');
    expect(queue.enqueue).toHaveBeenCalledWith({ auditId: 'a1', scanId: 's1' });
    expect(audit).toMatchObject({ id: 'a1', ruleCounts: [] });
  });

  it('refuses a scan that has not completed', async () => {
    scans.getOrThrow.mockResolvedValue({ ...scan, status: 'running' });

    expect(await codeOf(service.rerun('s1', 'o1', now))).toBe('SCAN_NOT_COMPLETED');
  });

  it('refuses an older scan whose content was pruned', async () => {
    repo.latestCompletedScanId!.mockResolvedValue('s2');

    expect(await codeOf(service.rerun('s1', 'o1', now))).toBe('AUDIT_CONTENT_UNAVAILABLE');
  });

  it('refuses while an audit is in progress, but not once it is stale', async () => {
    repo.findByScan!.mockResolvedValue({
      id: 'a1',
      status: 'running',
      updatedAt: new Date(now.getTime() - 1000),
    });
    expect(await codeOf(service.rerun('s1', 'o1', now))).toBe('AUDIT_IN_PROGRESS');

    repo.findByScan!.mockResolvedValue({
      id: 'a1',
      status: 'queued',
      updatedAt: new Date(now.getTime() - AUDIT_STALE_MS - 1),
    });
    await expect(service.rerun('s1', 'o1', now)).resolves.toMatchObject({ id: 'a1' });
  });

  it('lists changes with pagination echoed', async () => {
    repo.findByScan!.mockResolvedValue({ id: 'a1' });
    repo.listChanges!.mockResolvedValue({ items: [], total: 0 });

    const result = await service.listChanges('s1', 'o1', { kind: 'fixed', limit: 10, offset: 0 });

    expect(repo.listChanges).toHaveBeenCalledWith('a1', 'fixed', 10, 0);
    expect(result).toEqual({ items: [], total: 0, limit: 10, offset: 0 });
  });
});
