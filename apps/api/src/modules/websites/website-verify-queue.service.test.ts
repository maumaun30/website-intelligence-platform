import type { WebsiteVerifyJob } from '@wintel/types';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { WebsiteVerifyQueueService } from './website-verify-queue.service';

describe('WebsiteVerifyQueueService', () => {
  it('adds the job to the queue under the "verify" name', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new WebsiteVerifyQueueService({ add } as unknown as Queue<WebsiteVerifyJob>);
    const job: WebsiteVerifyJob = {
      websiteId: 'w1',
      domain: 'acme.test',
      url: 'https://acme.test',
      method: 'dns',
      token: 'tok',
    };

    await service.enqueue(job);

    expect(add).toHaveBeenCalledWith('verify', job);
  });
});
