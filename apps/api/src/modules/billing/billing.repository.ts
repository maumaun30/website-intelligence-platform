import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrganizationPlan, ScanFrequency } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Plan reads and usage counts. Plans themselves are written only by Stripe webhooks. */
@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async plan(organizationId: string): Promise<OrganizationPlan> {
    const organization = await this.prisma.client.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization.plan;
  }

  countWebsites(organizationId: string): Promise<number> {
    return this.prisma.client.website.count({ where: { organizationId } });
  }

  /** AI explanations the organization has requested in the given "YYYY-MM" month (0 if none). */
  async aiUsage(organizationId: string, month: string): Promise<number> {
    const usage = await this.prisma.client.organizationUsage.findUnique({
      where: { organizationId_month: { organizationId, month } },
      select: { aiExplanations: true },
    });
    return usage?.aiExplanations ?? 0;
  }

  /**
   * Counts one AI explanation against the month, but only while the month is below `limit`.
   * One statement, so concurrent requests cannot both take the last unit: the conflicting upsert
   * waits on the row lock and then re-evaluates the WHERE against the committed count.
   * Returns whether the unit was taken.
   */
  async incrementAiUsageBelow(
    organizationId: string,
    month: string,
    limit: number,
  ): Promise<boolean> {
    const rows = await this.prisma.client.$queryRaw<{ aiExplanations: number }[]>`
      INSERT INTO organization_usage ("organizationId", month, "aiExplanations", "updatedAt")
      VALUES (${organizationId}, ${month}, 1, now())
      ON CONFLICT ("organizationId", month)
      DO UPDATE SET "aiExplanations" = organization_usage."aiExplanations" + 1, "updatedAt" = now()
      WHERE organization_usage."aiExplanations" < ${limit}
      RETURNING "aiExplanations"
    `;
    return rows.length > 0;
  }

  listWebsiteFrequencies(
    organizationId: string,
  ): Promise<{ id: string; scanFrequency: ScanFrequency }[]> {
    return this.prisma.client.website.findMany({
      where: { organizationId },
      select: { id: true, scanFrequency: true },
    });
  }
}
