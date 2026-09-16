import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@wintel/database';
import type { CreateWebsiteInput, UpdateWebsiteInput, VerificationMethod } from '@wintel/types';

import { normalizeWebsiteUrl } from './normalize-url';
import { WebsiteVerifyQueueService } from './website-verify-queue.service';
import { WebsitesRepository } from './websites.repository';

/**
 * Website business logic: normalization, token issuance, tenant-scoped reads/writes, and enqueuing
 * ownership checks. HTTP concerns stay in the controller; Prisma concerns stay in the repository.
 */
@Injectable()
export class WebsitesService {
  constructor(
    private readonly repo: WebsitesRepository,
    private readonly verifyQueue: WebsiteVerifyQueueService,
  ) {}

  list(organizationId: string) {
    return this.repo.listByOrg(organizationId);
  }

  async getOrThrow(id: string, organizationId: string) {
    const website = await this.repo.findInOrg(id, organizationId);
    if (!website) {
      throw new NotFoundException('Website not found');
    }
    return website;
  }

  async create(organizationId: string, createdById: string, input: CreateWebsiteInput) {
    const { url, domain } = normalizeWebsiteUrl(input.url);
    try {
      return await this.repo.create({
        organizationId,
        createdById,
        name: input.name,
        url,
        domain,
        verificationToken: randomUUID(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A website with this domain already exists in this organization',
        );
      }
      throw error;
    }
  }

  async update(id: string, organizationId: string, input: UpdateWebsiteInput) {
    const updated = await this.repo.update(id, organizationId, input);
    if (!updated) {
      throw new NotFoundException('Website not found');
    }
    return updated;
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const removed = await this.repo.remove(id, organizationId);
    if (!removed) {
      throw new NotFoundException('Website not found');
    }
  }

  async requestVerification(id: string, organizationId: string, method: VerificationMethod) {
    const website = await this.repo.setVerificationPending(id, organizationId, method);
    if (!website) {
      throw new NotFoundException('Website not found');
    }
    await this.verifyQueue.enqueue({
      websiteId: website.id,
      domain: website.domain,
      url: website.url,
      method,
      token: website.verificationToken,
    });
    return website;
  }
}
