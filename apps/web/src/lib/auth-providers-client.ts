import { z } from 'zod';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const SOCIAL_PROVIDERS = ['github', 'google'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const responseSchema = z.object({ providers: z.array(z.enum(SOCIAL_PROVIDERS)) });

/** Which providers this deployment can sign in with. Public: the sign-in page needs it first. */
export async function getAuthProviders(): Promise<SocialProvider[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth-providers`, { cache: 'no-store' });

  if (!response.ok) {
    throw new ApiError(`Could not load sign-in providers (${response.status})`, response.status);
  }

  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  // An unknown provider is one this build has no button for, so an unparsable list means none.
  return parsed.success ? parsed.data.providers : [];
}
