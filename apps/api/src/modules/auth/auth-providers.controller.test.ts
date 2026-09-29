import type { ApiEnv } from '@wintel/config';
import { describe, expect, it } from 'vitest';

import { AuthProvidersController } from './auth-providers.controller';

function env(overrides: Partial<ApiEnv>): ApiEnv {
  return overrides as ApiEnv;
}

describe('AuthProvidersController', () => {
  it('lists nothing when no provider is configured', () => {
    expect(new AuthProvidersController(env({})).list()).toEqual({ providers: [] });
  });

  it('lists only the providers whose credentials are both present', () => {
    const controller = new AuthProvidersController(
      env({
        GITHUB_CLIENT_ID: 'gh-id',
        GITHUB_CLIENT_SECRET: 'gh-secret',
        GOOGLE_CLIENT_ID: 'google-id',
        GOOGLE_CLIENT_SECRET: 'google-secret',
      }),
    );

    expect(controller.list()).toEqual({ providers: ['github', 'google'] });
  });

  it('never leaks the credentials themselves', () => {
    const body = new AuthProvidersController(
      env({ GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' }),
    ).list();

    expect(JSON.stringify(body)).not.toContain('gh-secret');
    expect(body).toEqual({ providers: ['github'] });
  });
});
