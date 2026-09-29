import { describe, expect, it } from 'vitest';

import { emailJobSchema } from './email-jobs';

describe('emailJobSchema', () => {
  it('accepts a verification job', () => {
    const result = emailJobSchema.safeParse({
      type: 'verification',
      to: 'ada@wintel.test',
      url: 'http://localhost:4000/api/v1/auth/verify?token=abc',
    });

    expect(result.success).toBe(true);
  });

  it('accepts an invitation job', () => {
    const result = emailJobSchema.safeParse({
      type: 'invitation',
      to: 'invitee@wintel.test',
      organizationName: 'Analytical Engines',
      invitedByName: 'Ada',
      url: 'http://localhost:3000/accept-invitation/xyz',
    });

    expect(result.success).toBe(true);
  });

  it('accepts an email-change job', () => {
    const result = emailJobSchema.safeParse({
      type: 'email-change',
      to: 'ada@wintel.test',
      newEmail: 'ada@analytical.test',
      url: 'http://localhost:3000/verify-email-change?token=abc',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an email-change job whose new address is not an email', () => {
    expect(
      emailJobSchema.safeParse({
        type: 'email-change',
        to: 'ada@wintel.test',
        newEmail: 'not-an-email',
        url: 'http://localhost:3000/verify-email-change?token=abc',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown job type', () => {
    expect(emailJobSchema.safeParse({ type: 'newsletter', to: 'a@b.test' }).success).toBe(false);
  });

  it('rejects a verification job missing its url', () => {
    expect(emailJobSchema.safeParse({ type: 'verification', to: 'ada@wintel.test' }).success).toBe(
      false,
    );
  });
});
