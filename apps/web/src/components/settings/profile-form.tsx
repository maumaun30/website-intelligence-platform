'use client';

import { Button, Input, Label } from '@wintel/ui';
import { type FormEvent, useState } from 'react';

import { useChangeEmail, useUpdateName } from '@/lib/use-account';

/** Name saves immediately; an address change waits for the current inbox to approve it. */
export function ProfileForm({ user }: { user: { name: string; email: string } }) {
  const updateName = useUpdateName();
  const changeEmail = useChangeEmail();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);

  const onSaveName = (event: FormEvent) => {
    event.preventDefault();
    updateName.mutate(name.trim());
  };

  const onChangeEmail = (event: FormEvent) => {
    event.preventDefault();
    changeEmail.mutate(email.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSaveName} className="flex flex-col gap-2.5">
        <Label htmlFor="settings-name">Name</Label>
        <div className="flex gap-2">
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={updateName.isPending || name.trim() === user.name}
          >
            {updateName.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {updateName.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            Could not save your name.
          </p>
        ) : updateName.isSuccess ? (
          <p role="status" className="text-[13px] text-muted-foreground">
            Name saved.
          </p>
        ) : null}
      </form>

      <form onSubmit={onChangeEmail} className="flex flex-col gap-2.5">
        <Label htmlFor="settings-email">Email</Label>
        <div className="flex gap-2">
          <Input
            id="settings-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={changeEmail.isPending || email.trim() === user.email}
          >
            {changeEmail.isPending ? 'Sending…' : 'Change'}
          </Button>
        </div>
        {changeEmail.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            Could not start the change. Check the address and try again.
          </p>
        ) : changeEmail.isSuccess ? (
          <p role="status" className="text-[13px] text-muted-foreground">
            Check {user.email} — the address on file has to approve the change before it takes
            effect.
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            We email {user.email} to confirm. The new address only takes effect once that link is
            opened.
          </p>
        )}
      </form>
    </div>
  );
}
