'use client';

import { Button } from '@wintel/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';

import { authClient } from '@/lib/auth-client';

/**
 * Where the invitation email lands. The invitation is only readable by the signed-in invitee, so
 * this sits inside the authenticated layout: an invitee with no account is sent to sign-up first
 * by the layout's own session check, and comes back here afterwards.
 */
export default function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');

  const decide = async (accept: boolean) => {
    setState('working');
    const result = accept
      ? await authClient.organization.acceptInvitation({ invitationId: id })
      : await authClient.organization.rejectInvitation({ invitationId: id });

    if (result.error) {
      setState('error');
      return;
    }

    router.push(accept ? '/dashboard' : '/dashboard/settings');
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Join this organization</h1>
        <p className="text-sm text-muted-foreground">
          Accepting adds this account to the organization that invited you. Its websites, scans and
          billing become visible to you.
        </p>
      </div>

      {state === 'error' ? (
        <p role="alert" className="text-[13px] text-destructive">
          This invitation could not be used. It may have expired, been cancelled, or been sent to a
          different address than the one you are signed in with.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={state === 'working'} onClick={() => void decide(true)}>
          {state === 'working' ? 'Working…' : 'Accept invitation'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={state === 'working'}
          onClick={() => void decide(false)}
        >
          Decline
        </Button>
      </div>

      <Link href="/dashboard" className="text-[13px] text-muted-foreground hover:text-foreground">
        Back to the dashboard
      </Link>
    </div>
  );
}
