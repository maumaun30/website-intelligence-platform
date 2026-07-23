import { describe, expect, it } from 'vitest';

import {
  invitationInputSchema,
  principalSchema,
  signInInputSchema,
  signUpInputSchema,
} from './auth';

describe('signUpInputSchema', () => {
  it('accepts a valid sign-up', () => {
    const result = signUpInputSchema.safeParse({
      name: '  Ada  ',
      email: 'ada@wintel.test',
      password: 'correct-horse',
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Ada');
  });

  it('rejects a password shorter than the minimum', () => {
    const result = signUpInputSchema.safeParse({
      name: 'Ada',
      email: 'ada@wintel.test',
      password: 'short',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = signUpInputSchema.safeParse({
      name: 'Ada',
      email: 'not-an-email',
      password: 'correct-horse',
    });

    expect(result.success).toBe(false);
  });
});

describe('signInInputSchema', () => {
  it('requires a non-empty password', () => {
    expect(signInInputSchema.safeParse({ email: 'ada@wintel.test', password: '' }).success).toBe(
      false,
    );
  });
});

describe('invitationInputSchema', () => {
  it('defaults the role to member', () => {
    const result = invitationInputSchema.safeParse({ email: 'invitee@wintel.test' });

    expect(result.success).toBe(true);
    expect(result.data?.role).toBe('member');
  });

  it('rejects an unknown role', () => {
    const result = invitationInputSchema.safeParse({
      email: 'invitee@wintel.test',
      role: 'superadmin',
    });

    expect(result.success).toBe(false);
  });
});

describe('principalSchema', () => {
  it('accepts a principal with no active organization yet', () => {
    const result = principalSchema.safeParse({
      user: { id: 'u1', name: 'Ada', email: 'ada@wintel.test', emailVerified: true },
      activeOrganizationId: null,
      role: null,
    });

    expect(result.success).toBe(true);
  });
});
