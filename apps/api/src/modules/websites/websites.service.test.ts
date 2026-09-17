import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@wintel/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebsitesService } from './websites.service';

const sampleRow = {
  id: 'w1',
  organizationId: 'org1',
  createdById: 'user1',
  name: 'Acme',
  url: 'https://acme.test',
  domain: 'acme.test',
  verificationStatus: 'pending',
  verificationMethod: null,
  verificationToken: 'tok',
  verifiedAt: null,
  maxDepth: 3,
  maxPages: 500,
  includePaths: [],
  excludePaths: [],
  scanFrequency: 'manual',
  respectRobotsTxt: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRepo() {
  return {
    listByOrg: vi.fn(),
    findInOrg: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setVerificationPending: vi.fn(),
  };
}

function makeQueue() {
  return { enqueue: vi.fn().mockResolvedValue(undefined) };
}

describe('WebsitesService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let queue: ReturnType<typeof makeQueue>;
  let service: WebsitesService;

  beforeEach(() => {
    repo = makeRepo();
    queue = makeQueue();
    service = new WebsitesService(repo as never, queue as never);
  });

  it('normalizes and issues a token on create', async () => {
    repo.create.mockResolvedValue(sampleRow);

    await service.create('org1', 'user1', { name: 'Acme', url: 'https://ACME.test/' });

    const arg = repo.create.mock.calls[0]![0];
    expect(arg.url).toBe('https://acme.test');
    expect(arg.domain).toBe('acme.test');
    expect(typeof arg.verificationToken).toBe('string');
    expect(arg.verificationToken.length).toBeGreaterThan(0);
  });

  it('maps a duplicate-domain violation to a 409', async () => {
    repo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );

    await expect(
      service.create('org1', 'user1', { name: 'Acme', url: 'https://acme.test' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws 404 when getting a website not in the org', async () => {
    repo.findInOrg.mockResolvedValue(null);
    await expect(service.getOrThrow('w1', 'org1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets pending and enqueues a job on verification request', async () => {
    repo.setVerificationPending.mockResolvedValue({ ...sampleRow, verificationMethod: 'dns' });

    const result = await service.requestVerification('w1', 'org1', 'dns');

    expect(queue.enqueue).toHaveBeenCalledWith({
      websiteId: 'w1',
      domain: 'acme.test',
      url: 'https://acme.test',
      method: 'dns',
      token: 'tok',
    });
    expect(result.verificationMethod).toBe('dns');
  });

  it('throws 404 (and does not enqueue) verifying a website not in the org', async () => {
    repo.setVerificationPending.mockResolvedValue(null);
    await expect(service.requestVerification('w1', 'org1', 'dns')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  describe('scheduling on update', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');

    it('schedules the next scan when the frequency changes to daily', async () => {
      repo.findInOrg.mockResolvedValue({ ...sampleRow, scanFrequency: 'manual' });
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { scanFrequency: 'daily' }, now);

      expect(repo.update).toHaveBeenCalledWith('w1', 'org1', {
        scanFrequency: 'daily',
        nextScanAt: new Date('2026-09-18T12:00:00.000Z'),
      });
    });

    it('turns scheduling off when the frequency becomes manual', async () => {
      repo.findInOrg.mockResolvedValue({ ...sampleRow, scanFrequency: 'weekly' });
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { scanFrequency: 'manual' }, now);

      expect(repo.update).toHaveBeenCalledWith('w1', 'org1', {
        scanFrequency: 'manual',
        nextScanAt: null,
      });
    });

    it('leaves the schedule alone when the frequency is unchanged', async () => {
      repo.findInOrg.mockResolvedValue({ ...sampleRow, scanFrequency: 'daily' });
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { scanFrequency: 'daily', maxDepth: 4 }, now);

      expect(repo.update).toHaveBeenCalledWith('w1', 'org1', {
        scanFrequency: 'daily',
        maxDepth: 4,
      });
    });

    it('does not read the website when the frequency is not part of the update', async () => {
      repo.update.mockResolvedValue(sampleRow);

      await service.update('w1', 'org1', { name: 'Renamed' }, now);

      expect(repo.findInOrg).not.toHaveBeenCalled();
    });

    it('404s a frequency change for a website outside the org', async () => {
      repo.findInOrg.mockResolvedValue(null);

      await expect(
        service.update('w1', 'org1', { scanFrequency: 'daily' }, now),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
