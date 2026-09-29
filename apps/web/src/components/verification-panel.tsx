'use client';

import { VERIFICATION_METHODS, type VerificationMethod, type Website } from '@wintel/types';
import { Button, Select } from '@wintel/ui';
import { useState } from 'react';

import { useVerifyWebsite } from '@/lib/use-websites';

const STATUS_PILL = {
  verified: 'bg-success-soft text-success-soft-foreground',
  pending: 'bg-warning-soft text-warning-soft-foreground',
  failed: 'bg-destructive-soft text-destructive-soft-foreground',
} as const;

/** Shows ownership state and the per-method proof the user must publish before verifying. */
export function VerificationPanel({ website }: { website: Website }) {
  const verify = useVerifyWebsite(website.id);
  const [method, setMethod] = useState<VerificationMethod>('dns');

  const instructions =
    method === 'dns'
      ? `Add this TXT record to ${website.domain}:`
      : 'Add this tag to your homepage <head>:';
  const snippet =
    method === 'dns'
      ? `wintel-verify=${website.verificationToken}`
      : `<meta name="wintel-verify" content="${website.verificationToken}">`;

  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Verify you own {website.domain}</h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_PILL[website.verificationStatus]}`}
        >
          {website.verificationStatus}
        </span>
      </div>

      {website.verificationStatus === 'verified' ? (
        <p className="text-sm text-muted-foreground">This domain is verified.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Select
            aria-label="Verification method"
            value={method}
            onChange={(event) => setMethod(event.target.value as VerificationMethod)}
          >
            {VERIFICATION_METHODS.map((option) => (
              <option key={option} value={option}>
                {option === 'dns' ? 'DNS TXT record' : 'HTML meta tag'}
              </option>
            ))}
          </Select>
          <p className="text-sm text-muted-foreground">{instructions}</p>
          <code className="block rounded-md border border-border bg-background px-3 py-2.5 font-mono text-xs break-all">
            {snippet}
          </code>
          <p className="text-[13px] text-muted-foreground">
            DNS changes can take up to an hour to reach us. Publish the record, then check again.
          </p>
          <Button
            className="w-fit"
            onClick={() => verify.mutate(method)}
            disabled={verify.isPending}
          >
            {verify.isPending ? 'Verifying…' : 'Verify'}
          </Button>
        </div>
      )}
    </div>
  );
}
