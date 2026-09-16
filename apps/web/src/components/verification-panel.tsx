'use client';

import { VERIFICATION_METHODS, type VerificationMethod, type Website } from '@wintel/types';
import { Badge, Button, Card, Select } from '@wintel/ui';
import { useState } from 'react';

import { useVerifyWebsite } from '@/lib/use-websites';

const STATUS_VARIANT = { verified: 'success', pending: 'outline', failed: 'destructive' } as const;

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
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Ownership</h2>
        <Badge variant={STATUS_VARIANT[website.verificationStatus]}>
          {website.verificationStatus}
        </Badge>
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
          <code className="block rounded bg-muted px-3 py-2 text-xs break-all">{snippet}</code>
          <Button onClick={() => verify.mutate(method)} disabled={verify.isPending}>
            {verify.isPending ? 'Verifying…' : 'Verify'}
          </Button>
        </div>
      )}
    </Card>
  );
}
