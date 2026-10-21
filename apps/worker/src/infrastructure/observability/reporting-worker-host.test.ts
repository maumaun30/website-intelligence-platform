import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const capture = vi.hoisted(() => vi.fn());
vi.mock('./sentry', () => ({ captureException: capture }));

import { ReportingWorkerHost } from './reporting-worker-host';

class TestProcessor extends ReportingWorkerHost {
  process(): Promise<void> {
    return Promise.resolve();
  }
}

function job(attemptsMade: number, attempts = 3): Job {
  return {
    id: 'j1',
    name: 'scan',
    queueName: 'scan-audit',
    attemptsMade,
    opts: { attempts },
  } as unknown as Job;
}

let warn: MockInstance;
let error: MockInstance;

beforeEach(() => {
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  capture.mockReset();
  vi.restoreAllMocks();
});

describe('ReportingWorkerHost', () => {
  it('stays quiet while BullMQ still has retries left', () => {
    new TestProcessor().onJobFailed(job(1), new Error('site was briefly down'));

    expect(capture).not.toHaveBeenCalled();
  });

  it('reports the failure that exhausts the attempts, with the job named', () => {
    const error = new Error('crawl exploded');

    new TestProcessor().onJobFailed(job(3), error);

    expect(capture).toHaveBeenCalledWith(error, {
      queue: 'scan-audit',
      jobId: 'j1',
      jobName: 'scan',
      attemptsMade: 3,
    });
  });

  it('reports a failure that arrives without its job', () => {
    new TestProcessor().onJobFailed(undefined, new Error('worker lost the job'));

    expect(capture).toHaveBeenCalled();
  });

  // Without Sentry configured, a log line is the only place a failure shows up at all.
  it('logs a failed attempt that will be retried as a warning, with the reason', () => {
    new TestProcessor().onJobFailed(job(1), new Error('Resend refused the message (422)'));

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'scan-audit',
        jobId: 'j1',
        attemptsMade: 1,
        reason: 'Resend refused the message (422)',
      }),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('logs the failure that exhausts the attempts as an error, with the reason', () => {
    new TestProcessor().onJobFailed(job(3), new Error('Resend refused the message (422)'));

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'scan-audit',
        jobId: 'j1',
        attemptsMade: 3,
        reason: 'Resend refused the message (422)',
      }),
    );
  });
});
