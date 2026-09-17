import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { type Principal, type TrendQuery, trendQuerySchema } from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { InsightsService } from './insights.service';

/** Health over time and across the organization's websites. Members read. */
@Controller()
@UseGuards(SessionGuard, RolesGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Get('overview')
  overview(@CurrentUser() principal: Principal) {
    return this.insights.overview(this.orgId(principal));
  }

  @Get('websites/:id/trend')
  trend(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery,
  ) {
    return this.insights.trend(id, this.orgId(principal), query);
  }
}
