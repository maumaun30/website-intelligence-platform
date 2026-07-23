import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EMAIL_QUEUE, emailJobSchema } from '@wintel/types';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MailerService } from '../../infrastructure/mailer/mailer.service';
import { renderEmail } from './email.templates';

/**
 * Consumes the transactional email queue and delivers each job over SMTP. The payload is validated
 * against the shared contract before rendering, so a malformed job fails loudly (and is retried by
 * BullMQ) rather than sending a broken email.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(
    private readonly mailer: MailerService,
    @InjectPinoLogger(EmailProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const email = emailJobSchema.parse(job.data);

    await this.mailer.send(renderEmail(email));

    this.logger.info({ type: email.type, to: email.to }, 'Sent transactional email');
  }
}
