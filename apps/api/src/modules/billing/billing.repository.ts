import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrganizationPlan, ScanFrequency } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Plan reads, usage counts, and the one write that changes a plan. Always organization-scoped. */
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

  countExplanationsSince(organizationId: string, since: Date): Promise<number> {
    return this.prisma.client.explanation.count({
      where: { organizationId, requestedAt: { gte: since } },
    });
  }

  listWebsiteFrequencies(
    organizationId: string,
  ): Promise<{ id: string; scanFrequency: ScanFrequency }[]> {
    return this.prisma.client.website.findMany({
      where: { organizationId },
      select: { id: true, scanFrequency: true },
    });
  }

  /**
   * Switches the plan and resets the schedules the new plan forbids in one transaction: a partial
   * downgrade would leave scheduled scans running on a plan that does not allow them.
   */
  async applyPlanChange(
    organizationId: string,
    plan: OrganizationPlan,
    downgradedWebsiteIds: string[],
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { plan } });
      if (downgradedWebsiteIds.length > 0) {
        await tx.website.updateMany({
          where: { id: { in: downgradedWebsiteIds }, organizationId },
          data: { scanFrequency: 'manual', nextScanAt: null },
        });
      }
    });
  }
}
