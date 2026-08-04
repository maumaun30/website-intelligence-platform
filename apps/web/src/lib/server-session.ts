import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ServerSession {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  session: { id: string; activeOrganizationId?: string | null };
}

/**
 * Reads the current session on the server by forwarding the request cookies to the API's session
 * endpoint. Returns null when there is no valid session. Used by the authenticated layout to gate
 * access before any protected UI renders.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/get-session`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const data: unknown = await response.json().catch(() => null);

  if (data === null || typeof data !== 'object' || !('user' in data)) {
    return null;
  }

  return data as ServerSession;
}

/** Returns the session, or redirects to sign-in when there is none. */
export async function requireSession(): Promise<ServerSession> {
  const session = await getServerSession();

  if (!session) {
    redirect('/sign-in');
  }

  return session;
}
