'use client';

import { Button, Dialog } from '@wintel/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AddWebsiteForm } from '@/components/add-website-form';

/**
 * Adding a website is a decision, not part of reading the list, so it lives in a modal rather than
 * a form parked under the table. `?add=1` opens it, which lets the dashboard's "Add website"
 * button land here with the dialog already up.
 */
export function AddWebsiteDialog() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const requested = searchParams.get('add') === '1';

  useEffect(() => {
    if (requested) {
      setOpen(true);
    }
  }, [requested]);

  const close = () => {
    setOpen(false);
    if (requested) {
      // Otherwise the dialog reopens on every back-navigation to this URL.
      router.replace('/dashboard/websites');
    }
  };

  return (
    <>
      <Button type="button" className="h-10" onClick={() => setOpen(true)}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          stroke="currentColor"
          strokeWidth={1.8}
          fill="none"
          aria-hidden="true"
        >
          <path d="M7 2v10M2 7h10" />
        </svg>
        Add website
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title="Add a website"
        description="We verify that you own it before the first crawl."
      >
        <AddWebsiteForm onCreated={close} />
      </Dialog>
    </>
  );
}
