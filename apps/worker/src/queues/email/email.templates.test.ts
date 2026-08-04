import { describe, expect, it } from 'vitest';

import { renderEmail } from './email.templates';

describe('renderEmail', () => {
  it('renders a verification email carrying the verification url', () => {
    const email = renderEmail({
      type: 'verification',
      to: 'ada@wintel.test',
      url: 'http://localhost:4000/api/v1/auth/verify?token=abc',
    });

    expect(email.to).toBe('ada@wintel.test');
    expect(email.subject).toMatch(/verify/i);
    expect(email.text).toContain('http://localhost:4000/api/v1/auth/verify?token=abc');
  });

  it('renders an invitation email naming the organization and inviter', () => {
    const email = renderEmail({
      type: 'invitation',
      to: 'invitee@wintel.test',
      organizationName: 'Analytical Engines',
      invitedByName: 'Ada',
      url: 'http://localhost:3000/accept-invitation/xyz',
    });

    expect(email.subject).toContain('Analytical Engines');
    expect(email.text).toContain('Ada');
    expect(email.text).toContain('http://localhost:3000/accept-invitation/xyz');
  });
});
