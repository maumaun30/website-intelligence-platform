import { Controller, Get, Inject } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';

import { API_ENV } from '../../config/api-config.module';
import { enabledSocialProviders } from './create-auth';

/**
 * Which social providers this deployment can sign in with. Public on purpose: the sign-in page
 * needs it before anyone is authenticated, and it reveals nothing beyond which buttons to draw.
 */
@Controller('auth-providers')
export class AuthProvidersController {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  @Get()
  list(): { providers: string[] } {
    return { providers: enabledSocialProviders(this.env) };
  }
}
