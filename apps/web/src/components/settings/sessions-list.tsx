'use client';

import { Button } from '@wintel/ui';

import { useRevokeOtherSessions, useRevokeSession, useSessions } from '@/lib/use-account';

const dateTime = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** A rough device name from the user agent. Good enough to recognise your own laptop by. */
function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return 'Unknown device';
  }
  const browser = /Firefox/.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome/.test(userAgent)
        ? 'Chrome'
        : /Safari/.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const platform = /Macintosh|Mac OS/.test(userAgent)
    ? 'macOS'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${platform}`;
}

export function SessionsList({ currentSessionToken }: { currentSessionToken?: string }) {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  if (sessions.isPending) {
    return <p className="text-sm text-muted-foreground">Loading sessions…</p>;
  }
  if (sessions.isError) {
    return <p className="text-sm text-destructive">Could not load your sessions.</p>;
  }

  const others = sessions.data.filter((session) => session.token !== currentSessionToken);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {sessions.data.map((session) => {
          const isCurrent = session.token === currentSessionToken;
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">
                  {describeDevice(session.userAgent)}
                  {isCurrent ? (
                    <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11.5px] font-semibold text-primary-soft-foreground">
                      This device
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {session.ipAddress ?? 'unknown address'} · expires{' '}
                  {dateTime.format(new Date(session.expiresAt))} UTC
                </span>
              </div>
              {isCurrent ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(session.token)}
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {others.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          {revokeOthers.isPending
            ? 'Signing out…'
            : `Sign out ${others.length === 1 ? 'the other session' : `all ${others.length} other sessions`}`}
        </Button>
      ) : null}

      {revoke.isError || revokeOthers.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          Could not end that session. Try again.
        </p>
      ) : null}
    </div>
  );
}
