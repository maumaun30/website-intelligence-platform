import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { WEBSITE_VERIFY_QUEUE, type WebsiteVerifyJob } from '@wintel/types';
import { Queue } from 'bullmq';

/**
 * Producer side of ownership verification. The API only enqueues; the worker performs the DNS
 * lookup or page fetch and writes the result. A single job name keeps the queue legible.
 */
@Injectable()
export class WebsiteVerifyQueueService {
  constructor(@InjectQueue(WEBSITE_VERIFY_QUEUE) private readonly queue: Queue<WebsiteVerifyJob>) {}

  async enqueue(job: WebsiteVerifyJob): Promise<void> {
    await this.queue.add('verify', job);
  }
}
