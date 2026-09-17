import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Prisma } from '@wintel/database';
import {
  type FingerprintedIssue,
  type IssueSeverity,
  SCAN_AUDIT_QUEUE,
  computeHealthScore,
  diffIssues,
  issueFingerprint,
  scanAuditJobSchema,
} from '@wintel/types';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ISSUE_INSERT_BATCH } from './audit.constants';
import { ownPages } from './audit-context';
import { AUDIT_CONTEXT_LOADER, type AuditContextLoaderFn } from './audit-context-loader';
import { runAudit } from './run-audit';

const REPLACE_TIMEOUT_MS = 60_000;

/**
 * Owns an audit's lifecycle. Claims `queued → running` conditionally (a re-delivered job is
 * skipped), builds the context, runs the rules, and swaps the issue set in one transaction so a
 * failure never leaves an audit half-replaced. The same transaction stores the health score and what
 * changed since the website's previous completed audit. Failures mark the audit `failed` and rethrow.
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

  /** The website's newest completed audit from a scan created before this one. */
  private async findBaseline(scanId: string) {
    const client = this.prisma.client;
    const scan = await client.scan.findUniqueOrThrow({
      where: { id: scanId },
      select: { websiteId: true, createdAt: true },
    });
    return client.audit.findFirst({
      where: {
        status: 'completed',
        scan: { websiteId: scan.websiteId, createdAt: { lt: scan.createdAt } },
      },
      orderBy: { scan: { createdAt: 'desc' } },
      select: {
        id: true,
        score: true,
        issues: {
          select: {
            fingerprint: true,
            ruleId: true,
            severity: true,
            message: true,
            page: { select: { path: true } },
          },
        },
      },
    });
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

      const pathById = new Map(context.pages.map((page) => [page.id, page.path]));
      const fingerprinted = issues.map((issue) => {
        const path = pathById.get(issue.pageId) ?? '';
        return {
          ...issue,
          path,
          fingerprint: issueFingerprint(issue.ruleId, path, issue.evidence),
        };
      });

      const affected: Record<IssueSeverity, Set<string>> = {
        critical: new Set(),
        warning: new Set(),
        notice: new Set(),
      };
      for (const issue of fingerprinted) {
        affected[issue.severity].add(issue.pageId);
      }
      const score = computeHealthScore(
        {
          critical: affected.critical.size,
          warning: affected.warning.size,
          notice: affected.notice.size,
        },
        ownPages(context).length,
      );

      const baseline = await this.findBaseline(data.scanId);
      const baselineIssues: FingerprintedIssue[] = (baseline?.issues ?? []).map((issue) => ({
        fingerprint: issue.fingerprint,
        ruleId: issue.ruleId,
        severity: issue.severity,
        message: issue.message,
        path: issue.page.path,
      }));
      const diff = baseline ? diffIssues(fingerprinted, baselineIssues) : null;
      const changes = diff
        ? [
            ...diff.newIssues.map((issue) => ({ kind: 'new' as const, issue })),
            ...diff.fixedIssues.map((issue) => ({ kind: 'fixed' as const, issue })),
          ]
        : [];
      const scoreDelta =
        score !== null && baseline !== null && baseline.score !== null
          ? score - baseline.score
          : null;

      await client.$transaction(
        async (tx) => {
          await tx.issue.deleteMany({ where: { auditId: data.auditId } });
          await tx.issueChange.deleteMany({ where: { auditId: data.auditId } });
          await tx.explanation.deleteMany({ where: { auditId: data.auditId } });
          for (let start = 0; start < fingerprinted.length; start += ISSUE_INSERT_BATCH) {
            await tx.issue.createMany({
              data: fingerprinted.slice(start, start + ISSUE_INSERT_BATCH).map((issue) => ({
                auditId: data.auditId,
                pageId: issue.pageId,
                ruleId: issue.ruleId,
                severity: issue.severity,
                message: issue.message,
                fingerprint: issue.fingerprint,
                evidence: issue.evidence as Prisma.InputJsonObject,
              })),
            });
          }
          for (let start = 0; start < changes.length; start += ISSUE_INSERT_BATCH) {
            await tx.issueChange.createMany({
              data: changes.slice(start, start + ISSUE_INSERT_BATCH).map(({ kind, issue }) => ({
                auditId: data.auditId,
                kind,
                ruleId: issue.ruleId,
                severity: issue.severity,
                path: issue.path,
                message: issue.message,
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
              score,
              scoreDelta,
              newIssueCount: diff ? diff.newIssues.length : null,
              fixedIssueCount: diff ? diff.fixedIssues.length : null,
              previousAuditId: baseline?.id ?? null,
            },
          });
        },
        { timeout: REPLACE_TIMEOUT_MS },
      );

      this.logger.info({ auditId: data.auditId, score, ...counts }, 'Audit completed');
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
