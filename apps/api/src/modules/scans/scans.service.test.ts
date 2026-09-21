import { ConflictException, NotFoundException } from '@nestjs/common';
import { SCAN_DEADLINE_MS } from '@wintel/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScansService } from './scans.service';

const website = {
  id: 'w1',
  organizationId: 'org1',
  url: 'https://acme.test',
  domain: 'acme.test',
  verificationStatus: 'verified',
  maxDepth: 3,
  maxPages: 500,
  includePaths: ['/blog'],
  excludePaths: ['/admin'],
  respectRobotsTxt: true,
};

function makeRepo() {
  return {
    listForWebsite: vi.fn(),
    findInOrg: vi.fn(),
    findActiveForWebsite: vi.fn().mockResolvedValue(null),
    createQueued: vi.fn().mockResolvedValue({ id: 's1', status: 'queued' }),
    markFailed: vi.fn().mockResolvedValue(undefined),
    listPages: vi.fn(),
  };
}

describe('ScansService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let websites: { getOrThrow: ReturnType<typeof vi.fn> };
  let queue: { enqueue: ReturnType<typeof vi.fn> };
  let service: ScansService;

  beforeEach(() => {
    repo = makeRepo();
    websites = { getOrThrow: vi.fn().mockResolvedValue(website) };
    queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    service = new ScansService(
      repo as never,
      websites as never,
      queue as never,
      { planFor: vi.fn().mockResolvedValue('agency') } as never,
    );
  });

  it('creates a queued scan and enqueues a config snapshot', async () => {
    const scan = await service.start('w1', 'org1');

    expect(repo.createQueued).toHaveBeenCalledWith({ websiteId: 'w1', organizationId: 'org1' });
    expect(queue.enqueue).toHaveBeenCalledWith({
      scanId: 's1',
      websiteId: 'w1',
      organizationId: 'org1',
      url: 'https://acme.test',
      domain: 'acme.test',
      maxDepth: 3,
      maxPages: 500,
      includePaths: ['/blog'],
      excludePaths: ['/admin'],
      respectRobotsTxt: true,
    });
    expect(scan.id).toBe('s1');
  });

  it('propagates 404 for a website outside the org', async () => {
    websites.getOrThrow.mockRejectedValue(new NotFoundException());

    await expect(service.start('w1', 'org1')).rejects.toBeInstanceOf(NotFoundException);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('refuses an unverified website with WEBSITE_NOT_VERIFIED', async () => {
    websites.getOrThrow.mockResolvedValue({ ...website, verificationStatus: 'pending' });

    const error = await service.start('w1', 'org1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      details: { code: 'WEBSITE_NOT_VERIFIED' },
    });
    expect(repo.createQueued).not.toHaveBeenCalled();
  });

  it('refuses a second scan while one is active', async () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    repo.findActiveForWebsite.mockResolvedValue({
      id: 's0',
      status: 'running',
      startedAt: new Date(now.getTime() - 60_000),
      createdAt: new Date(now.getTime() - 60_000),
    });

    const error = await service.start('w1', 'org1', now).catch((caught: unknown) => caught);

    expect((error as ConflictException).getResponse()).toMatchObject({
      details: { code: 'SCAN_IN_PROGRESS' },
    });
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('refuses a second scan while one is still queued, however old', async () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    repo.findActiveForWebsite.mockResolvedValue({
      id: 's0',
      status: 'queued',
      startedAt: null,
      createdAt: new Date(now.getTime() - SCAN_DEADLINE_MS * 3),
    });

    await expect(service.start('w1', 'org1', now)).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails a stale running scan and starts a new one', async () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    repo.findActiveForWebsite.mockResolvedValue({
      id: 's0',
      status: 'running',
      startedAt: new Date(now.getTime() - SCAN_DEADLINE_MS - 1),
      createdAt: new Date(now.getTime() - SCAN_DEADLINE_MS - 1),
    });

    await service.start('w1', 'org1', now);

    expect(repo.markFailed).toHaveBeenCalledWith('s0', 'org1', expect.stringContaining('deadline'));
    expect(repo.createQueued).toHaveBeenCalled();
  });

  it('lists pages with the pagination echoed back', async () => {
    repo.listPages.mockResolvedValue({ items: [{ id: 'p1' }], total: 1 });

    const result = await service.listPages('s1', 'org1', { limit: 50, offset: 0 });

    expect(result).toEqual({ items: [{ id: 'p1' }], total: 1, limit: 50, offset: 0 });
  });

  it('throws 404 for pages of a scan outside the org', async () => {
    repo.listPages.mockResolvedValue(null);

    await expect(service.listPages('s1', 'org1', { limit: 50, offset: 0 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 404 for a scan outside the org', async () => {
    repo.findInOrg.mockResolvedValue(null);

    await expect(service.getOrThrow('s1', 'org1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks website ownership before listing its scans', async () => {
    repo.listForWebsite.mockResolvedValue([]);

    await service.listForWebsite('w1', 'org1');

    expect(websites.getOrThrow).toHaveBeenCalledWith('w1', 'org1');
    expect(repo.listForWebsite).toHaveBeenCalledWith('w1', 'org1');
  });

  it('enqueues the crawl with the page cap clamped to the plan', async () => {
    const crawlQueue = { enqueue: vi.fn() };
    const service = new ScansService(
      {
        findActiveForWebsite: vi.fn().mockResolvedValue(null),
        createQueued: vi.fn().mockResolvedValue({ id: 's1' }),
        markFailed: vi.fn(),
      } as never,
      {
        getOrThrow: vi.fn().mockResolvedValue({
          id: 'w1',
          verificationStatus: 'verified',
          url: 'https://example.com',
          domain: 'example.com',
          maxDepth: 3,
          maxPages: 5000,
          includePaths: [],
          excludePaths: [],
          respectRobotsTxt: true,
        }),
      } as never,
      crawlQueue as never,
      { planFor: vi.fn().mockResolvedValue('free') } as never,
    );

    await service.start('w1', 'o1');

    expect(crawlQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ maxPages: 100 }));
  });
});
