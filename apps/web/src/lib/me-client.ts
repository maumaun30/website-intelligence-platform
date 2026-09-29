import { type Principal, principalSchema } from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Who the caller is, and what they may do in their active organization. */
export async function getMe(): Promise<Principal> {
  const response = await fetch(`${API_BASE_URL}/api/v1/me`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(`Could not load the current user (${response.status})`, response.status);
  }

  const parsed = principalSchema.safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new ApiError('The API returned a principal that does not match the contract.', 200);
  }

  return parsed.data;
}
