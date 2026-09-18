import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type Principal,
  type RequestExplanationInput,
  requestExplanationInputSchema,
} from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { ExplanationsService } from './explanations.service';

/** AI explanations of one rule in one audit. */
@Controller('scans/:id/audit/explanations')
@UseGuards(SessionGuard, RolesGuard)
export class ExplanationsController {
  constructor(private readonly explanations: ExplanationsService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Get(':ruleId')
  get(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.explanations.get(id, this.orgId(principal), ruleId);
  }

  @Post()
  @HttpCode(202)
  request(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(requestExplanationInputSchema)) body: RequestExplanationInput,
  ) {
    return this.explanations.request(
      id,
      { organizationId: this.orgId(principal), userId: principal.user.id, role: principal.role },
      body,
    );
  }
}
