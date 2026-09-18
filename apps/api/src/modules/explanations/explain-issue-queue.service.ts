import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { EXPLAIN_ISSUE_QUEUE, type ExplainIssueJob } from '@wintel/types';
import { Queue } from 'bullmq';

/** Producer for explanation jobs: one retry with backoff for transient model/API errors. */
@Injectable()
export class ExplainIssueQueueService {
  constructor(@InjectQueue(EXPLAIN_ISSUE_QUEUE) private readonly queue: Queue<ExplainIssueJob>) {}

  async enqueue(job: ExplainIssueJob): Promise<void> {
    await this.queue.add('explain', job, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
