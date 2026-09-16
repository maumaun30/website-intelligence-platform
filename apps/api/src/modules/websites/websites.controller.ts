import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateWebsiteInput,
  type Principal,
  type UpdateWebsiteInput,
  type VerifyWebsiteInput,
  createWebsiteInputSchema,
  updateWebsiteInputSchema,
  verifyWebsiteInputSchema,
} from '@wintel/types';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { WebsitesService } from './websites.service';

/** Website management for the caller's active organization. Members read; admins and owners write. */
@Controller('websites')
@UseGuards(SessionGuard, RolesGuard)
export class WebsitesController {
  constructor(private readonly websites: WebsitesService) {}

  private orgId(principal: Principal): string {
    if (!principal.activeOrganizationId) {
      throw new ForbiddenException('No active organization');
    }
    return principal.activeOrganizationId;
  }

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.websites.list(this.orgId(principal));
  }

  @Get(':id')
  get(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.websites.getOrThrow(id, this.orgId(principal));
  }

  @Post()
  @Roles('admin')
  create(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createWebsiteInputSchema)) body: CreateWebsiteInput,
  ) {
    return this.websites.create(this.orgId(principal), principal.user.id, body);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWebsiteInputSchema)) body: UpdateWebsiteInput,
  ) {
    return this.websites.update(id, this.orgId(principal), body);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@CurrentUser() principal: Principal, @Param('id') id: string): Promise<void> {
    await this.websites.remove(id, this.orgId(principal));
  }

  @Post(':id/verify')
  @Roles('admin')
  verify(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verifyWebsiteInputSchema)) body: VerifyWebsiteInput,
  ) {
    return this.websites.requestVerification(id, this.orgId(principal), body.method);
  }
}
