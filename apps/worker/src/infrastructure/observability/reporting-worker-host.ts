import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { captureException } from './sentry';

/**
 * A `WorkerHost` that reports the jobs it loses.
 *
 * Every failed attempt is logged with its reason: without Sentry configured, the log is the only
 * place a failure shows up at all, and BullMQ itself records nothing there.
 *
 * BullMQ retries a failed job and then gives up quietly; until now the only trace was a log line.
 * Only the final failure is reported — an intermediate attempt is expected to fail sometimes (a
 * site that is briefly down, a rate limit), and reporting each one would drown the real failures.
 */
export abstract class ReportingWorkerHost extends WorkerHost {
  private readonly failureLogger = new Logger(ReportingWorkerHost.name);

  @OnWorkerEvent('failed')
  onJobFailed(job: Job | undefined, error: Error): void {
    const context = {
      queue: job?.queueName,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade ?? 0,
    };

    // A failure that arrives without its job cannot be judged on attempts, and a worker losing a
    // job is exactly the kind of thing worth knowing about, so it is always reported.
    if (job !== undefined && job.attemptsMade < (job.opts.attempts ?? 1)) {
      this.failureLogger.warn({
        msg: 'Job attempt failed; it will be retried',
        ...context,
        reason: error.message,
      });
      return;
    }

    this.failureLogger.error({ msg: 'Job failed for good', ...context, reason: error.message });
    captureException(error, context);
  }
}
