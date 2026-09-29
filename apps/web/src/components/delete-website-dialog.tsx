'use client';

import type { Website } from '@wintel/types';
import { Button, Dialog, Input, Label } from '@wintel/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useDeleteWebsite } from '@/lib/use-websites';

/**
 * Deleting a website takes its whole history with it — every scan, page, audit, issue and AI
 * explanation cascades — and none of it can be brought back. So the dialog says exactly what goes,
 * and asks for the domain to be typed rather than accepting a single click.
 */
export function DeleteWebsiteDialog({ website }: { website: Website }) {
  const router = useRouter();
  const remove = useDeleteWebsite();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const confirmed = typed.trim() === website.domain;

  const close = () => {
    setOpen(false);
    setTyped('');
    remove.reset();
  };

  const onDelete = () => {
    if (!confirmed) {
      return;
    }
    remove.mutate(website.id, {
      onSuccess: () => {
        setOpen(false);
        router.push('/dashboard/websites');
      },
    });
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Delete website
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title={`Delete ${website.name}?`}
        description="This cannot be undone."
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed">
            Deleting it also deletes every scan of{' '}
            <span className="font-mono text-[13px]">{website.domain}</span>, along with their pages,
            audits, issue history and AI explanations. Its score history goes with it.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-domain">
              Type <span className="font-mono">{website.domain}</span> to confirm
            </Label>
            <Input
              id="confirm-domain"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </div>

          {remove.isError ? (
            <p role="alert" className="text-[13px] text-destructive">
              Could not delete this website. Try again.
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmed || remove.isPending}
              onClick={onDelete}
            >
              {remove.isPending ? 'Deleting…' : 'Delete website'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
