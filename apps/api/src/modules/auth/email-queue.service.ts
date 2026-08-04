import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { EMAIL_QUEUE, type EmailJob } from '@wintel/types';
import { Queue } from 'bullmq';

/**
 * Producer side of the transactional email pipeline. The API only enqueues; the worker sends.
 * The job name is the email type so the queue is legible in dashboards and the worker can route.
 */
@Injectable()
export class EmailQueueService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJob>) {}

  async enqueue(job: EmailJob): Promise<void> {
    await this.queue.add(job.type, job);
  }
}
