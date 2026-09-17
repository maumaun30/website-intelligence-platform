import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Read models for scores over time and across websites. Every query is filtered by organization. */
@Injectable()
export class InsightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async trend(websiteId: string, organizationId: string, limit: number) {
    const audits = await this.prisma.client.audit.findMany({
      where: { organizationId, status: 'completed', scan: { websiteId } },
      orderBy: { scan: { createdAt: 'desc' } },
      take: limit,
      include: { scan: { select: { id: true, trigger: true } } },
    });
    return audits.reverse().map((audit) => ({
      auditId: audit.id,
      scanId: audit.scan.id,
      finishedAt: audit.finishedAt,
      trigger: audit.scan.trigger,
      score: audit.score,
      criticalCount: audit.criticalCount,
      warningCount: audit.warningCount,
      noticeCount: audit.noticeCount,
    }));
  }

  async overview(organizationId: string) {
    const client = this.prisma.client;
    const websites = await client.website.findMany({
      where: { organizationId },
      include: {
        scans: {
          where: { audit: { status: 'completed' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { audit: true },
        },
      },
    });
    const lastScans = await client.scan.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      distinct: ['websiteId'],
      select: { id: true, websiteId: true, status: true, trigger: true, createdAt: true },
    });
    const lastScanByWebsite = new Map(lastScans.map((scan) => [scan.websiteId, scan]));

    return websites.map((website) => {
      const audit = website.scans[0]?.audit ?? null;
      const lastScan = lastScanByWebsite.get(website.id);
      return {
        websiteId: website.id,
        name: website.name,
        domain: website.domain,
        verificationStatus: website.verificationStatus,
        scanFrequency: website.scanFrequency,
        nextScanAt: website.nextScanAt,
        score: audit?.score ?? null,
        scoreDelta: audit?.scoreDelta ?? null,
        criticalCount: audit?.criticalCount ?? null,
        auditedAt: audit?.finishedAt ?? null,
        lastScan: lastScan
          ? {
              id: lastScan.id,
              status: lastScan.status,
              trigger: lastScan.trigger,
              createdAt: lastScan.createdAt,
            }
          : null,
      };
    });
  }
}
