import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  WEBSITE_VERIFY_QUEUE,
  type WebsiteVerifyJob,
  computeNextScanAt,
  websiteVerifyJobSchema,
} from '@wintel/types';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DnsVerificationStrategy } from './dns-strategy';
import { MetaVerificationStrategy } from './meta-strategy';
import type { VerificationStrategy } from './verification-strategy';

/**
 * Consumes ownership-verification jobs. The job is validated against the shared contract, the right
 * strategy runs, and the result is written back to the website row. A thrown strategy error means we
 * could not complete the check (DNS down, fetch failed) — it propagates so BullMQ retries. A
 * completed check that did not find the token is a normal `failed` outcome, not an error.
 */
@Processor(WEBSITE_VERIFY_QUEUE)
export class WebsiteVerifyProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dnsStrategy: DnsVerificationStrategy,
    private readonly metaStrategy: MetaVerificationStrategy,
    @InjectPinoLogger(WebsiteVerifyProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const data: WebsiteVerifyJob = websiteVerifyJobSchema.parse(job.data);
    const strategy: VerificationStrategy =
      data.method === 'dns' ? this.dnsStrategy : this.metaStrategy;

    const ok = await strategy.verify(data);

    await this.prisma.client.website.update({
      where: { id: data.websiteId },
      data: {
        verificationStatus: ok ? 'verified' : 'failed',
        verifiedAt: ok ? new Date() : null,
      },
    });

    if (ok) {
      // A newly verified website with a schedule gets its first run; an existing schedule is kept.
      const now = new Date();
      for (const frequency of ['daily', 'weekly'] as const) {
        await this.prisma.client.website.updateMany({
          where: { id: data.websiteId, nextScanAt: null, scanFrequency: frequency },
          data: { nextScanAt: computeNextScanAt(frequency, now) },
        });
      }
    }

    this.logger.info(
      { websiteId: data.websiteId, method: data.method, verified: ok },
      'Processed website verification',
    );
  }
}
