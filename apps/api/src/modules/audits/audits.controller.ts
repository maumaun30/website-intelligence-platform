import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AUDIT_RULES,
  type AuditRule,
  type AuditRuleId,
  type IssueListQuery,
  type Principal,
  issueListQuerySchema,
} from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { AuditsService } from './audits.service';

/** Audits of the caller's scans. Members read; admins and owners re-run. */
@Controller()
@UseGuards(SessionGuard, RolesGuard)
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Get('audit-rules')
  rules(): AuditRule[] {
    return (Object.keys(AUDIT_RULES) as AuditRuleId[]).map((id) => ({ id, ...AUDIT_RULES[id] }));
  }

  @Get('scans/:id/audit')
  get(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.audits.getForScan(id, this.orgId(principal));
  }

  @Post('scans/:id/audit')
  @Roles('admin')
  @HttpCode(202)
  rerun(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.audits.rerun(id, this.orgId(principal));
  }

  @Get('scans/:id/issues')
  issues(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(issueListQuerySchema)) query: IssueListQuery,
  ) {
    return this.audits.listIssues(id, this.orgId(principal), query);
  }
}
