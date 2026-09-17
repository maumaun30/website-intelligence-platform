import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ACTIVE_AUDIT_STATUSES,
  AUDIT_STALE_MS,
  type IssueChangeListQuery,
  type IssueListQuery,
} from '@wintel/types';

import { ScansService } from '../scans/scans.service';
import { AuditsRepository } from './audits.repository';
import { ScanAuditQueueService } from './scan-audit-queue.service';

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ message, details: { code } });
}

/** Audit reads and re-run rules. Every entry point first proves the scan belongs to the caller's org. */
@Injectable()
export class AuditsService {
  constructor(
    private readonly repo: AuditsRepository,
    private readonly scans: ScansService,
    private readonly auditQueue: ScanAuditQueueService,
  ) {}

  async findAuditOrThrow(scanId: string, organizationId: string) {
    await this.scans.getOrThrow(scanId, organizationId);
    const audit = await this.repo.findByScan(scanId, organizationId);
    if (!audit) {
      throw new NotFoundException('Audit not found');
    }
    return audit;
  }

  async getForScan(scanId: string, organizationId: string) {
    const audit = await this.findAuditOrThrow(scanId, organizationId);
    return { ...audit, ruleCounts: await this.repo.ruleCounts(audit.id) };
  }

  async listIssues(scanId: string, organizationId: string, query: IssueListQuery) {
    const audit = await this.findAuditOrThrow(scanId, organizationId);
    const { limit, offset, ...filters } = query;
    const result = await this.repo.listIssues(audit.id, filters, limit, offset);
    return { ...result, limit, offset };
  }

  async listChanges(scanId: string, organizationId: string, query: IssueChangeListQuery) {
    const audit = await this.findAuditOrThrow(scanId, organizationId);
    const result = await this.repo.listChanges(audit.id, query.kind, query.limit, query.offset);
    return { ...result, limit: query.limit, offset: query.offset };
  }

  async rerun(scanId: string, organizationId: string, now: Date = new Date()) {
    const scan = await this.scans.getOrThrow(scanId, organizationId);
    if (scan.status !== 'completed') {
      throw conflict('SCAN_NOT_COMPLETED', 'Only a completed scan can be audited');
    }
    if ((await this.repo.latestCompletedScanId(scan.websiteId, organizationId)) !== scan.id) {
      throw conflict(
        'AUDIT_CONTENT_UNAVAILABLE',
        "Only the website's latest completed scan keeps the page content an audit needs",
      );
    }

    const existing = await this.repo.findByScan(scanId, organizationId);
    const active =
      existing !== null &&
      (ACTIVE_AUDIT_STATUSES as readonly string[]).includes(existing.status) &&
      now.getTime() - existing.updatedAt.getTime() < AUDIT_STALE_MS;
    if (active) {
      throw conflict('AUDIT_IN_PROGRESS', 'This scan is already being audited');
    }

    const audit = await this.repo.requeue(scanId, organizationId);
    await this.auditQueue.enqueue({ auditId: audit.id, scanId });
    return { ...audit, ruleCounts: [] };
  }
}
