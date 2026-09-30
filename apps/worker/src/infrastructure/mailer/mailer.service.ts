import { Inject, Injectable } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import { createTransport } from 'nodemailer';

import { WORKER_ENV } from '../../config/worker-config.module';
import type { Mailer, OutgoingEmail } from './outgoing-email';
import { ResendMailer } from './resend-mailer';

export type { Mailer, OutgoingEmail } from './outgoing-email';

/** The local path: Mailpit in development, or any relay that speaks SMTP. */
class SmtpMailer implements Mailer {
  private readonly transporter;

  constructor(
    private readonly from: string,
    host: string,
    port: number,
  ) {
    // Mailpit and most dev relays speak plain SMTP; TLS is negotiated per the relay in production.
    this.transporter = createTransport({ host, port, secure: false });
  }

  async send(message: OutgoingEmail): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

/**
 * Chooses the transport once, at construction, from validated config. Processors depend on `send`
 * and never learn which provider is behind it.
 */
@Injectable()
export class MailerService implements Mailer {
  private readonly transport: Mailer;

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
    this.transport =
      env.EMAIL_PROVIDER === 'resend'
        ? // The schema refuses to boot on this provider without a key, so it is present here.
          new ResendMailer({ apiKey: env.RESEND_API_KEY!, from: env.SMTP_FROM })
        : new SmtpMailer(env.SMTP_FROM, env.SMTP_HOST, env.SMTP_PORT);
  }

  send(message: OutgoingEmail): Promise<void> {
    return this.transport.send(message);
  }
}
