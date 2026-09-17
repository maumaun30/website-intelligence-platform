import type { WebsiteCrawlJob } from '@wintel/types';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { WebsiteCrawlQueueService } from './website-crawl-queue.service';

describe('WebsiteCrawlQueueService', () => {
  it('adds the job under the "crawl" name with retries disabled', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new WebsiteCrawlQueueService({ add } as unknown as Queue<WebsiteCrawlJob>);
    const job: WebsiteCrawlJob = {
      scanId: 's1',
      websiteId: 'w1',
      organizationId: 'o1',
      url: 'https://acme.test',
      domain: 'acme.test',
      maxDepth: 3,
      maxPages: 500,
      includePaths: [],
      excludePaths: [],
      respectRobotsTxt: true,
    };

    await service.enqueue(job);

    expect(add).toHaveBeenCalledWith('crawl', job, { attempts: 1 });
  });
});
