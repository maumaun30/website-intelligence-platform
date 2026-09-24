import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { type CreateCheckoutInput, type Principal, createCheckoutInputSchema } from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { BillingService } from './billing.service';
import { SubscriptionsService } from './subscriptions.service';

/** The active organization's plan. Members read it; only an owner may change it. */
@Controller('billing')
@UseGuards(SessionGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

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

  /** Sends the owner to hosted Stripe Checkout. Answers 200: it creates a Stripe session, not a resource of ours. */
  @Post('checkout')
  @HttpCode(200)
  @Roles('owner')
  checkout(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createCheckoutInputSchema)) body: CreateCheckoutInput,
  ) {
    return this.subscriptions.checkout(this.orgId(principal), body.plan, principal.user.email);
  }

  /** Sends the owner to the hosted Billing Portal to manage an existing subscription. */
  @Post('portal')
  @HttpCode(200)
  @Roles('owner')
  portal(@CurrentUser() principal: Principal) {
    return this.subscriptions.portal(this.orgId(principal));
  }
}
