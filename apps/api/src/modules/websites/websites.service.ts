import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@wintel/database';
import {
  type CreateWebsiteInput,
  type UpdateWebsiteInput,
  type VerificationMethod,
  PLAN_LIMITS,
  computeNextScanAt,
} from '@wintel/types';

import { BillingService } from '../billing/billing.service';
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
    private readonly billing: BillingService,
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
    const plan = await this.billing.planFor(organizationId);
    const { url, domain } = normalizeWebsiteUrl(input.url);
    try {
      // The count and the insert share one lock, so two concurrent creates cannot both take the
      // last slot the plan allows.
      const result = await this.repo.createWithinQuota({
        organizationId,
        createdById,
        name: input.name,
        url,
        domain,
        verificationToken: randomUUID(),
        limit: PLAN_LIMITS[plan].websites,
      });

      if ('refusedWith' in result) {
        throw new ForbiddenException({
          message: 'Your plan does not allow any more websites',
          details: { code: result.refusedWith, limit: result.limit, current: result.current },
        });
      }
      return result.website;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A website with this domain already exists in this organization',
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateWebsiteInput,
    now: Date = new Date(),
  ) {
    const data: Prisma.WebsiteUpdateInput = { ...input };

    // Only a real frequency change moves the schedule — and only a real change is checked against
    // the plan, so a grandfathered website whose stored frequency is no longer allowed can still be
    // saved unchanged (e.g. from the settings form) without tripping the quota gate.
    if (input.scanFrequency !== undefined) {
      const current = await this.repo.findInOrg(id, organizationId);
      if (!current) {
        throw new NotFoundException('Website not found');
      }
      if (current.scanFrequency !== input.scanFrequency) {
        await this.billing.assertScanFrequency(organizationId, input.scanFrequency);
        data.nextScanAt = computeNextScanAt(input.scanFrequency, now);
      }
    }

    const updated = await this.repo.update(id, organizationId, data);
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
