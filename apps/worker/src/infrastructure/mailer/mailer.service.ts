import { Inject, Injectable } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import { type Transporter, createTransport } from 'nodemailer';

import { WORKER_ENV } from '../../config/worker-config.module';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Wraps the SMTP transport. Locally this points at Mailpit; in production at a real relay. Kept
 * behind a small interface so processors depend on `send`, not on nodemailer directly.
 */
@Injectable()
export class MailerService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
    // Mailpit and most dev relays speak plain SMTP; TLS is negotiated per the relay in production.
    this.transporter = createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false });
    this.from = env.SMTP_FROM;
  }

  async send(message: OutgoingEmail): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
