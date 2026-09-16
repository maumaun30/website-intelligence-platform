import type { WebsiteVerifyJob } from '@wintel/types';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { WebsiteVerifyProcessor } from './website-verify.processor';

function makePrisma() {
  const update = vi.fn().mockResolvedValue(undefined);

  return { prisma: { client: { website: { update } } }, update };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function job(method: 'dns' | 'meta'): Job<WebsiteVerifyJob> {
  return {
    data: { websiteId: 'w1', domain: 'acme.test', url: 'https://acme.test', method, token: 'tok' },
  } as Job<WebsiteVerifyJob>;
}

describe('WebsiteVerifyProcessor', () => {
  it('marks the website verified when the DNS strategy succeeds', async () => {
    const { prisma, update } = makePrisma();
    const dns = { verify: vi.fn().mockResolvedValue(true) };
    const meta = { verify: vi.fn().mockResolvedValue(false) };
    const processor = new WebsiteVerifyProcessor(
      prisma as never,
      dns as never,
      meta as never,
      logger as never,
    );

    await processor.process(job('dns'));

    expect(dns.verify).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w1' },
        data: expect.objectContaining({ verificationStatus: 'verified' }),
      }),
    );
  });

  it('marks the website failed when the token is absent', async () => {
    const { prisma, update } = makePrisma();
    const dns = { verify: vi.fn().mockResolvedValue(false) };
    const meta = { verify: vi.fn() };
    const processor = new WebsiteVerifyProcessor(
      prisma as never,
      dns as never,
      meta as never,
      logger as never,
    );

    await processor.process(job('dns'));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'failed' }) }),
    );
  });

  it('routes to the meta strategy for a meta job', async () => {
    const { prisma } = makePrisma();
    const dns = { verify: vi.fn() };
    const meta = { verify: vi.fn().mockResolvedValue(true) };
    const processor = new WebsiteVerifyProcessor(
      prisma as never,
      dns as never,
      meta as never,
      logger as never,
    );

    await processor.process(job('meta'));

    expect(meta.verify).toHaveBeenCalled();
    expect(dns.verify).not.toHaveBeenCalled();
  });

  it('rethrows an infra fault so BullMQ retries and does not write a status', async () => {
    const { prisma, update } = makePrisma();
    const dns = { verify: vi.fn().mockRejectedValue(new Error('ENOTFOUND')) };
    const meta = { verify: vi.fn() };
    const processor = new WebsiteVerifyProcessor(
      prisma as never,
      dns as never,
      meta as never,
      logger as never,
    );

    await expect(processor.process(job('dns'))).rejects.toThrow('ENOTFOUND');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a malformed job', async () => {
    const { prisma } = makePrisma();
    const dns = { verify: vi.fn() };
    const meta = { verify: vi.fn() };
    const processor = new WebsiteVerifyProcessor(
      prisma as never,
      dns as never,
      meta as never,
      logger as never,
    );

    await expect(processor.process({ data: { nonsense: true } } as never)).rejects.toBeDefined();
  });
});
