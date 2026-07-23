import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { MailerService, OutgoingEmail } from '../../infrastructure/mailer/mailer.service';
import { EmailProcessor } from './email.processor';

const logger = { info: vi.fn() } as unknown as PinoLogger;

function makeProcessor() {
  const send = vi.fn<(message: OutgoingEmail) => Promise<void>>().mockResolvedValue();
  const mailer = { send } as unknown as MailerService;
  return { processor: new EmailProcessor(mailer, logger), send };
}

describe('EmailProcessor', () => {
  it('validates and sends a verification email', async () => {
    const { processor, send } = makeProcessor();

    await processor.process({
      data: { type: 'verification', to: 'ada@wintel.test', url: 'http://localhost/verify' },
    } as Job);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@wintel.test', subject: expect.stringMatching(/verify/i) }),
    );
  });

  it('throws on a malformed job so BullMQ can retry rather than sending garbage', async () => {
    const { processor, send } = makeProcessor();

    await expect(processor.process({ data: { type: 'newsletter' } } as Job)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
