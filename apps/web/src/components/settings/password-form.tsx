'use client';

import { MIN_PASSWORD_LENGTH } from '@wintel/types';
import { Button, Input, Label } from '@wintel/ui';
import { type FormEvent, useState } from 'react';

import { useChangePassword } from '@/lib/use-account';

export function PasswordForm() {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [tooShort, setTooShort] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-describedby="new-password-hint"
          required
        />
        <span id="new-password-hint" className="text-[13px] text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters. Changing it signs out your other sessions.
        </span>
      </div>

      {tooShort ? (
        <p role="alert" className="text-[13px] text-destructive">
          Use at least {MIN_PASSWORD_LENGTH} characters.
        </p>
      ) : null}
      {changePassword.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          Could not change your password. Check your current password and try again.
        </p>
      ) : null}
      {changePassword.isSuccess ? (
        <p role="status" className="text-[13px] text-muted-foreground">
          Password changed, and your other sessions were signed out.
        </p>
      ) : null}

      <Button type="submit" className="w-fit" disabled={changePassword.isPending}>
        {changePassword.isPending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}
