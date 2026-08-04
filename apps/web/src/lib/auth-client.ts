import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Browser-side Better Auth client. Points at the API's mounted handler; the server owns sessions
 * and cookies, so this only issues the requests and exposes the reactive session hook.
 */
export const authClient = createAuthClient({
  baseURL,
  basePath: '/api/v1/auth',
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
