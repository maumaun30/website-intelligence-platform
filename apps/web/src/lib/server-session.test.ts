import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesToString = vi.fn(() => 'session=abc');

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: cookiesToString }),
}));

class RedirectError extends Error {}
const redirect = vi.fn((path: string): never => {
  throw new RedirectError(path);
});

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}));

import { getServerSession, requireSession } from './server-session';

const sessionBody = {
  user: { id: 'u1', name: 'Ada', email: 'ada@example.com', emailVerified: true },
  session: { id: 's1', activeOrganizationId: 'o1' },
};

describe('getServerSession', () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the session and forwards cookies when the API responds with one', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(sessionBody), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await getServerSession();

    expect(session).toEqual(sessionBody);
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).cookie).toBe('session=abc');
  });

  it('returns null when the API rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('Unauthorized', { status: 401 }))),
    );

    expect(await getServerSession()).toBeNull();
  });

  it('returns null when the body has no user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
    );

    expect(await getServerSession()).toBeNull();
  });
});

describe('requireSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    redirect.mockClear();
  });

  it('returns the session when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(sessionBody), { status: 200 }))),
    );

    expect(await requireSession()).toEqual(sessionBody);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when there is no session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('Unauthorized', { status: 401 }))),
    );

    await expect(requireSession()).rejects.toBeInstanceOf(RedirectError);
    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });
});
