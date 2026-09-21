import { Injectable } from '@nestjs/common';
import { Prisma } from '@wintel/database';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Explanation rows. Reached only through an audit the service has already org-checked. */
@Injectable()
export class ExplanationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(auditId: string, ruleId: string) {
    return this.prisma.client.explanation.findUnique({
      where: { auditId_ruleId: { auditId, ruleId } },
    });
  }

  countIssues(auditId: string, ruleId: string) {
    return this.prisma.client.issue.count({ where: { auditId, ruleId } });
  }

  queue(data: { auditId: string; ruleId: string; organizationId: string; requestedById: string }) {
    const reset = {
      status: 'queued' as const,
      content: Prisma.DbNull,
      model: null,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      error: null,
      requestedById: data.requestedById,
      requestedAt: new Date(),
    };
    return this.prisma.client.explanation.upsert({
      where: { auditId_ruleId: { auditId: data.auditId, ruleId: data.ruleId } },
      create: {
        auditId: data.auditId,
        ruleId: data.ruleId,
        organizationId: data.organizationId,
        requestedById: data.requestedById,
      },
      update: reset,
    });
  }
}
