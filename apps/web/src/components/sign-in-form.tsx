'use client';

import { signInInputSchema } from '@wintel/types';
import { Button, Input, Label } from '@wintel/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { signIn } from '@/lib/auth-client';

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signInInputSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });

    if (!parsed.success) {
      setError('Enter a valid email and password.');
      return;
    }

    setPending(true);
    const result = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? 'Could not sign in.');
      return;
    }

    router.push('/dashboard');
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error === null ? null : (
        <p
          role="alert"
          className="rounded-lg bg-destructive-soft px-3 py-2.5 text-[13px] leading-snug font-medium text-destructive-soft-foreground"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
