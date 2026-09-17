import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import {
  ACTIVE_EXPLANATION_STATUSES,
  AI_DAILY_LIMIT,
  type OrganizationRole,
  type RequestExplanationInput,
} from '@wintel/types';

import { API_ENV } from '../../config/api-config.module';
import { AuditsService } from '../audits/audits.service';
import { ExplainIssueQueueService } from './explain-issue-queue.service';
import { ExplanationsRepository } from './explanations.repository';

export interface ExplanationRequester {
  organizationId: string;
  userId: string;
  role: OrganizationRole | null;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** On-demand explanations: reads are free; generating is gated, capped, and admin-only to repeat. */
@Injectable()
export class ExplanationsService {
  constructor(
    private readonly repo: ExplanationsRepository,
    private readonly audits: AuditsService,
    private readonly queue: ExplainIssueQueueService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'AI_EXPLANATIONS_ENABLED'>,
  ) {}

  async get(scanId: string, organizationId: string, ruleId: string) {
    const audit = await this.audits.findAuditOrThrow(scanId, organizationId);
    const explanation = await this.repo.find(audit.id, ruleId);
    if (!explanation) {
      throw new NotFoundException('Explanation not found');
    }
    return explanation;
  }

  async request(
    scanId: string,
    requester: ExplanationRequester,
    input: RequestExplanationInput,
    now: Date = new Date(),
  ) {
    if (!this.env.AI_EXPLANATIONS_ENABLED) {
      throw new ServiceUnavailableException({
        message: 'AI explanations are not enabled',
        details: { code: 'AI_UNAVAILABLE' },
      });
    }

    const audit = await this.audits.findAuditOrThrow(scanId, requester.organizationId);
    if (audit.status !== 'completed') {
      throw new ConflictException({
        message: 'The audit has not completed',
        details: { code: 'AUDIT_NOT_COMPLETED' },
      });
    }
    if ((await this.repo.countIssues(audit.id, input.ruleId)) === 0) {
      throw new ConflictException({
        message: 'This rule has no issues in the audit',
        details: { code: 'NO_ISSUES_FOR_RULE' },
      });
    }

    const existing = await this.repo.find(audit.id, input.ruleId);
    if (existing) {
      const active = (ACTIVE_EXPLANATION_STATUSES as readonly string[]).includes(existing.status);
      if (active || !input.regenerate) {
        return existing;
      }
      if (requester.role !== 'admin' && requester.role !== 'owner') {
        throw new ForbiddenException('Only admins can regenerate explanations');
      }
    }

    const used = await this.repo.countRequestedSince(requester.organizationId, startOfUtcDay(now));
    if (used >= AI_DAILY_LIMIT) {
      throw new HttpException(
        { message: 'Daily AI explanation limit reached', details: { code: 'AI_DAILY_LIMIT' } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const explanation = await this.repo.queue({
      auditId: audit.id,
      ruleId: input.ruleId,
      organizationId: requester.organizationId,
      requestedById: requester.userId,
    });
    await this.queue.enqueue({ explanationId: explanation.id });
    return explanation;
  }
}
