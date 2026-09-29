'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useWebsites } from '@/lib/use-websites';

const DISMISSED_KEY = 'wintel-verification-notice-dismissed';

/** Session storage throws in some privacy modes, and a banner is not worth an error boundary. */
function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // Nothing to do: the notice simply returns on the next load.
  }
}

/**
 * A website that is never verified is a website that is never scanned, and nothing outside its own
 * detail page said so. This sits under the topbar until every website is verified.
 *
 * It reads the websites query the rest of the app already caches, so it costs no extra request.
 * Dismissal lasts for the session only — the point of it is to be persistent — and the sidebar
 * keeps its own marker for anyone who dismisses it.
 */
export function VerificationNotice() {
  const { data } = useWebsites();
  const [dismissed, setDismissed] = useState(readDismissed);

  const failed = (data ?? []).filter((website) => website.verificationStatus === 'failed');
  const pending = (data ?? []).filter((website) => website.verificationStatus === 'pending');
  const waiting = [...failed, ...pending];

  if (dismissed || waiting.length === 0) {
    return null;
  }

  const only = waiting.length === 1 ? waiting[0]! : undefined;
  const href = only ? `/dashboard/websites/${only.id}` : '/dashboard/websites';
  const isFailure = failed.length > 0;

  return (
    <div
      role={isFailure ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-3 border-b px-10 py-3 text-[13px] ${
        isFailure
          ? 'border-destructive/30 bg-destructive-soft text-destructive-soft-foreground'
          : 'border-warning/30 bg-warning-soft text-warning-soft-foreground'
      }`}
    >
      <span aria-hidden="true" className="grid size-5 flex-none place-items-center">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 4.5v4M8 11h.01" strokeLinecap="round" />
        </svg>
      </span>
      <span className="flex-1 font-medium">
        {isFailure && only
          ? `We could not verify ${only.name}. Check the record and try again.`
          : isFailure
            ? `We could not verify ${failed.length} of your websites. Check their records and try again.`
            : only
              ? `${only.name} needs verification before it can be scanned.`
              : `${waiting.length} websites need verification before they can be scanned.`}
      </span>
      <Link href={href} className="font-semibold underline underline-offset-2">
        {only ? 'Verify it' : 'Verify them'}
      </Link>
      <button
        type="button"
        onClick={() => {
          rememberDismissed();
          setDismissed(true);
        }}
        className="rounded-sm px-1.5 py-0.5 font-medium opacity-70 transition-opacity ease-out hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  );
}
