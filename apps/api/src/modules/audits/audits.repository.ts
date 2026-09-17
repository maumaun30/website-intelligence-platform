import { Injectable } from '@nestjs/common';
import type { AuditRuleId, IssueChangeKind, IssueSeverity, RuleCount } from '@wintel/types';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Audit and issue access for the API. Audits carry `organizationId`, which every audit lookup
 * filters on; issues are only ever read through an audit that already passed that filter.
 */
@Injectable()
export class AuditsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByScan(scanId: string, organizationId: string) {
    return this.prisma.client.audit.findFirst({ where: { scanId, organizationId } });
  }

  async ruleCounts(auditId: string): Promise<RuleCount[]> {
    const groups = await this.prisma.client.issue.groupBy({
      by: ['ruleId', 'severity'],
      where: { auditId },
      _count: { _all: true },
    });
    return groups.map((group) => ({
      ruleId: group.ruleId as AuditRuleId,
      severity: group.severity,
      count: group._count._all,
    }));
  }

  async listIssues(
    auditId: string,
    filters: { severity?: IssueSeverity; ruleId?: AuditRuleId },
    limit: number,
    offset: number,
  ) {
    const where = { auditId, ...filters };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.issue.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { ruleId: 'asc' }, { page: { path: 'asc' } }],
        include: { page: { select: { url: true, path: true } } },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.issue.count({ where }),
    ]);
    return { items, total };
  }

  async latestCompletedScanId(websiteId: string, organizationId: string): Promise<string | null> {
    const scan = await this.prisma.client.scan.findFirst({
      where: { websiteId, organizationId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return scan?.id ?? null;
  }

  requeue(scanId: string, organizationId: string) {
    return this.prisma.client.audit.upsert({
      where: { scanId },
      create: { scanId, organizationId },
      update: {
        status: 'queued',
        criticalCount: 0,
        warningCount: 0,
        noticeCount: 0,
        startedAt: null,
        finishedAt: null,
        error: null,
      },
    });
  }

  async listChanges(
    auditId: string,
    kind: IssueChangeKind | undefined,
    limit: number,
    offset: number,
  ) {
    const where = { auditId, ...(kind === undefined ? {} : { kind }) };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.issueChange.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { ruleId: 'asc' }, { path: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.client.issueChange.count({ where }),
    ]);
    return { items, total };
  }
}
