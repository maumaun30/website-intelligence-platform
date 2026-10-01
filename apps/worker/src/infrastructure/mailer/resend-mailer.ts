import type { OutgoingEmail } from './outgoing-email';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendMailerOptions {
  apiKey: string;
  from: string;
}

/**
 * Sends through Resend's HTTP API rather than SMTP. Hosts commonly block outbound SMTP, and a
 * failed HTTP call says what was wrong — an unverified sending domain, a malformed address —
 * where an SMTP timeout says nothing.
 *
 * A refusal throws, so the queue retries and the job is recorded as failed. Silently swallowing
 * it would report a verification email as sent that never left the building.
 */
export class ResendMailer {
  constructor(
    private readonly options: ResendMailerOptions,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: OutgoingEmail): Promise<void> {
    const response = await this.fetchFn(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.options.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      // The body carries the provider's own explanation; the key is never in it.
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend refused the message (${response.status}): ${detail}`);
    }
  }
}
