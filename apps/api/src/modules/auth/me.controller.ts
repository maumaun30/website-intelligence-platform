import { Controller, Get, UseGuards } from '@nestjs/common';
import type { Principal } from '@wintel/types';

import { CurrentUser } from './current-user.decorator';
import { SessionGuard } from './session.guard';

/** The authenticated principal for the current session. Powers the web app's "who am I" call. */
@Controller('me')
export class MeController {
  @Get()
  @UseGuards(SessionGuard)
  me(@CurrentUser() principal: Principal): Principal {
    return principal;
  }
}
