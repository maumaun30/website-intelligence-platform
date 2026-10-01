import type { Job } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => capture.mockReset());

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
});
