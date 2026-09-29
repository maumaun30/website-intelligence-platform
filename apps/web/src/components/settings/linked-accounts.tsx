'use client';

import { Button } from '@wintel/ui';
import { useState } from 'react';

import { PROVIDER_ICONS, PROVIDER_LABELS } from '@/components/social-sign-in';
import { authClient } from '@/lib/auth-client';
import { SOCIAL_PROVIDERS, type SocialProvider } from '@/lib/auth-providers-client';
import { useAuthProviders, useLinkedAccounts, useUnlinkAccount } from '@/lib/use-account';

function isSocial(providerId: string): providerId is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(providerId);
}

/**
 * The ways this account can sign in. Unlinking the last one would lock the person out, so the
 * final credential can never be removed — password included, which counts as one.
 */
export function LinkedAccounts() {
  const available = useAuthProviders();
  const accounts = useLinkedAccounts();
  const unlink = useUnlinkAccount();
  const [pending, setPending] = useState<SocialProvider | null>(null);

  if (!available.data || available.data.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        This deployment has no social sign-in configured, so your email and password are the only
        way in.
      </p>
    );
  }

  if (accounts.isPending) {
    return <p className="text-sm text-muted-foreground">Loading linked accounts…</p>;
  }
  if (accounts.isError) {
    return <p className="text-sm text-destructive">Could not load your linked accounts.</p>;
  }

  const linked = accounts.data;
  const onlyOneLeft = linked.length <= 1;

  const link = async (provider: SocialProvider) => {
    setPending(provider);
    await authClient.linkSocial({ provider, callbackURL: '/dashboard/settings' });
    setPending(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {linked.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span aria-hidden="true" className="flex size-4 items-center justify-center">
              {isSocial(account.providerId) ? PROVIDER_ICONS[account.providerId] : null}
            </span>
            <span className="flex-1 text-sm font-medium">
              {isSocial(account.providerId)
                ? PROVIDER_LABELS[account.providerId]
                : 'Email and password'}
            </span>
            {onlyOneLeft ? (
              <span className="text-xs text-muted-foreground">Your only way to sign in</span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={unlink.isPending}
                onClick={() =>
                  unlink.mutate({ providerId: account.providerId, accountId: account.accountId })
                }
              >
                Disconnect
              </Button>
            )}
          </li>
        ))}
      </ul>

      {available.data
        .filter((provider) => !linked.some((account) => account.providerId === provider))
        .map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-fit"
            disabled={pending !== null}
            onClick={() => void link(provider)}
          >
            {PROVIDER_ICONS[provider]}
            {pending === provider ? 'Redirecting…' : `Connect ${PROVIDER_LABELS[provider]}`}
          </Button>
        ))}

      {unlink.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          Could not disconnect that account. Try again.
        </p>
      ) : null}
    </div>
  );
}
