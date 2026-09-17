import { Injectable } from '@nestjs/common';
import { ACTIVE_SCAN_STATUSES } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const RECENT_SCAN_LIMIT = 20;

/**
 * The only place scan and page rows are read or written by the API. Every query carries
 * `organizationId` (denormalized onto `Scan`), so the tenant boundary is enforced here and nowhere
 * else. Pages have no org column of their own: they are reachable only through a scan that has
 * already passed the org check.
 */
@Injectable()
export class ScansRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForWebsite(websiteId: string, organizationId: string) {
    return this.prisma.client.scan.findMany({
      where: { websiteId, organizationId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SCAN_LIMIT,
    });
  }

  findInOrg(id: string, organizationId: string) {
    return this.prisma.client.scan.findFirst({ where: { id, organizationId } });
  }

  findActiveForWebsite(websiteId: string, organizationId: string) {
    return this.prisma.client.scan.findFirst({
      where: { websiteId, organizationId, status: { in: [...ACTIVE_SCAN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createQueued(data: { websiteId: string; organizationId: string }) {
    return this.prisma.client.scan.create({ data });
  }

  async markFailed(id: string, organizationId: string, error: string): Promise<void> {
    await this.prisma.client.scan.updateMany({
      where: { id, organizationId },
      data: { status: 'failed', error, finishedAt: new Date() },
    });
  }

  async listPages(scanId: string, organizationId: string, limit: number, offset: number) {
    const scan = await this.findInOrg(scanId, organizationId);
    if (!scan) {
      return null;
    }

    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.page.findMany({
        where: { scanId },
        orderBy: [{ depth: 'asc' }, { fetchedAt: 'asc' }, { url: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.client.page.count({ where: { scanId } }),
    ]);

    return { items, total };
  }
}
