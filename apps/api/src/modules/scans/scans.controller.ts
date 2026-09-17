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
import { type PageListQuery, type Principal, pageListQuerySchema } from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { ScansService } from './scans.service';

/** Crawls of the caller's websites. Members read; admins and owners start scans. */
@Controller()
@UseGuards(SessionGuard, RolesGuard)
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Post('websites/:websiteId/scans')
  @Roles('admin')
  @HttpCode(202)
  start(@CurrentUser() principal: Principal, @Param('websiteId') websiteId: string) {
    return this.scans.start(websiteId, this.orgId(principal));
  }

  @Get('websites/:websiteId/scans')
  list(@CurrentUser() principal: Principal, @Param('websiteId') websiteId: string) {
    return this.scans.listForWebsite(websiteId, this.orgId(principal));
  }

  @Get('scans/:id')
  get(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.scans.getOrThrow(id, this.orgId(principal));
  }

  @Get('scans/:id/pages')
  pages(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(pageListQuerySchema)) query: PageListQuery,
  ) {
    return this.scans.listPages(id, this.orgId(principal), query);
  }
}
