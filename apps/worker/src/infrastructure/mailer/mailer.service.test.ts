import type { WorkerEnv } from '@wintel/config';
import { describe, expect, it } from 'vitest';

import { MailerService } from './mailer.service';
import { ResendMailer } from './resend-mailer';

function env(overrides: Partial<WorkerEnv>): WorkerEnv {
  return {
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_FROM: 'Wintel <no-reply@wintel.local>',
    ...overrides,
  } as WorkerEnv;
}

/** The transport is private on purpose; the test reads it to prove the choice, not to use it. */
function transportOf(service: MailerService): unknown {
  return (service as unknown as { transport: unknown }).transport;
}

describe('MailerService', () => {
  it('uses SMTP by default, which is what Mailpit listens on locally', () => {
    const service = new MailerService(env({}));

    expect(transportOf(service)).not.toBeInstanceOf(ResendMailer);
  });

  it('uses Resend once the provider is configured', () => {
    const service = new MailerService(env({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_key' }));

    expect(transportOf(service)).toBeInstanceOf(ResendMailer);
  });
});
