'use client';

import { createWebsiteInputSchema } from '@wintel/types';
import { Button, Input, Label } from '@wintel/ui';
import { type FormEvent, useState } from 'react';

import { useCreateWebsite } from '@/lib/use-websites';

/** Registers a website under the caller's active organization. Validation mirrors the API contract. */
export function AddWebsiteForm() {
  const create = useCreateWebsite();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = createWebsiteInputSchema.safeParse({
      name: form.get('name'),
      url: form.get('url'),
    });

    if (!parsed.success) {
      setError('Enter a name and a valid http(s) URL.');
      return;
    }

    const formElement = event.currentTarget;
    create.mutate(parsed.data, { onSuccess: () => formElement.reset() });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="url">URL</Label>
        <Input id="url" name="url" type="url" placeholder="https://example.com" required />
      </div>
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Adding…' : 'Add website'}
      </Button>
    </form>
  );
}
