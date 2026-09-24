import { Injectable } from '@nestjs/common';
import { Prisma } from '@wintel/database';
import type { VerificationMethod } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

type WebsiteRow = Awaited<ReturnType<PrismaService['client']['website']['findFirst']>>;

interface CreateWebsiteData {
  organizationId: string;
  createdById: string;
  name: string;
  url: string;
  domain: string;
  verificationToken: string;
}

/**
 * The only place website rows are read or written. Every query is filtered by `organizationId`, so
 * the tenant boundary is enforced in one auditable spot; no caller can accidentally issue an
 * unscoped query. Scoped mutations use `updateMany`/`deleteMany` (which take a full `where`) and
 * report how many rows matched, so a cross-org write is a no-op rather than an error.
 */
@Injectable()
export class WebsitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByOrg(organizationId: string) {
    return this.prisma.client.website.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findInOrg(id: string, organizationId: string) {
    return this.prisma.client.website.findFirst({ where: { id, organizationId } });
  }

  /**
   * Counts and inserts under one lock on the organization row, so two concurrent creates cannot
   * both see the last free slot. A plan limit is worth money now, so check-then-act is not enough.
   */
  async createWithinQuota(input: CreateWebsiteData & { limit: number }) {
    const { limit, ...data } = input;

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organization WHERE id = ${data.organizationId} FOR UPDATE`;

      const current = await tx.website.count({ where: { organizationId: data.organizationId } });
      if (current >= limit) {
        return { refusedWith: 'PLAN_WEBSITE_LIMIT' as const, limit, current };
      }

      return { website: await tx.website.create({ data }) };
    });
  }

  create(data: CreateWebsiteData) {
    return this.prisma.client.website.create({ data });
  }

  async update(
    id: string,
    organizationId: string,
    data: Prisma.WebsiteUpdateInput,
  ): Promise<WebsiteRow> {
    const { count } = await this.prisma.client.website.updateMany({
      where: { id, organizationId },
      data,
    });
    if (count === 0) {
      return null;
    }
    return this.findInOrg(id, organizationId);
  }

  async remove(id: string, organizationId: string): Promise<boolean> {
    const { count } = await this.prisma.client.website.deleteMany({
      where: { id, organizationId },
    });
    return count > 0;
  }

  setVerificationPending(id: string, organizationId: string, method: VerificationMethod) {
    return this.update(id, organizationId, {
      verificationMethod: method,
      verificationStatus: 'pending',
      verifiedAt: null,
    });
  }
}
