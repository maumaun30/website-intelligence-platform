import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { type ChangePlanInput, type Principal, changePlanInputSchema } from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { BillingService } from './billing.service';

/** The active organization's plan. Members read it; only an owner may change it. */
@Controller('billing')
@UseGuards(SessionGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Get()
  state(@CurrentUser() principal: Principal) {
    return this.billing.state(this.orgId(principal));
  }

  @Post('plan')
  @Roles('owner')
  changePlan(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(changePlanInputSchema)) body: ChangePlanInput,
  ) {
    return this.billing.changePlan(this.orgId(principal), body.plan);
  }
}
