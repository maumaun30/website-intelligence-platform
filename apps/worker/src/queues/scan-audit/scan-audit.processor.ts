import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Prisma } from '@wintel/database';
import { SCAN_AUDIT_QUEUE, scanAuditJobSchema } from '@wintel/types';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ISSUE_INSERT_BATCH } from './audit.constants';
import { AUDIT_CONTEXT_LOADER, type AuditContextLoaderFn } from './audit-context-loader';
import { runAudit } from './run-audit';

const REPLACE_TIMEOUT_MS = 60_000;

/**
 * Owns an audit's lifecycle. Claims `queued → running` conditionally (a re-delivered job is
 * skipped), builds the context, runs the rules, and swaps the issue set in one transaction so a
 * failure never leaves an audit half-replaced. Failures mark the audit `failed` and rethrow.
 */
@Processor(SCAN_AUDIT_QUEUE)
export class ScanAuditProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUDIT_CONTEXT_LOADER) private readonly loadContext: AuditContextLoaderFn,
    @InjectPinoLogger(ScanAuditProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const data = scanAuditJobSchema.parse(job.data);
    const client = this.prisma.client;

    const { count } = await client.audit.updateMany({
      where: { id: data.auditId, status: 'queued' },
      data: { status: 'running', startedAt: new Date(), finishedAt: null, error: null },
    });
    if (count === 0) {
      this.logger.warn(
        { auditId: data.auditId },
        'Skipping audit job for an audit that is not queued',
      );
      return;
    }

    try {
      const { context, unreadableContent } = await this.loadContext(client, data.scanId);
      if (unreadableContent > 0) {
        this.logger.warn(
          { auditId: data.auditId, unreadableContent },
          'Skipped unreadable page content',
        );
      }
      const { issues, counts } = runAudit(context);

      await client.$transaction(
        async (tx) => {
          await tx.issue.deleteMany({ where: { auditId: data.auditId } });
          for (let start = 0; start < issues.length; start += ISSUE_INSERT_BATCH) {
            await tx.issue.createMany({
              data: issues.slice(start, start + ISSUE_INSERT_BATCH).map((issue) => ({
                auditId: data.auditId,
                pageId: issue.pageId,
                ruleId: issue.ruleId,
                severity: issue.severity,
                message: issue.message,
                evidence: issue.evidence as Prisma.InputJsonObject,
              })),
            });
          }
          await tx.audit.update({
            where: { id: data.auditId },
            data: {
              status: 'completed',
              finishedAt: new Date(),
              criticalCount: counts.critical,
              warningCount: counts.warning,
              noticeCount: counts.notice,
            },
          });
        },
        { timeout: REPLACE_TIMEOUT_MS },
      );

      this.logger.info({ auditId: data.auditId, ...counts }, 'Audit completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await client.audit.update({
        where: { id: data.auditId },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      });
      this.logger.error({ auditId: data.auditId, err: error }, 'Audit failed');
      throw error;
    }
  }
}
