'use client';

import { Button } from '@wintel/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { signOut } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await signOut();
    setPending(false);
    router.push('/sign-in');
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
