import { describe, expect, it } from 'vitest';

import { websiteCrawlJobSchema } from './scan-jobs';

const job = {
  scanId: 's1',
  websiteId: 'w1',
  organizationId: 'o1',
  url: 'https://acme.test',
  domain: 'acme.test',
  maxDepth: 3,
  maxPages: 500,
  includePaths: [],
  excludePaths: ['/admin'],
  respectRobotsTxt: true,
};

describe('websiteCrawlJobSchema', () => {
  it('accepts a complete crawl job', () => {
    expect(websiteCrawlJobSchema.safeParse(job).success).toBe(true);
  });

  it('rejects a job without a scan id', () => {
    const { scanId: _scanId, ...rest } = job;

    expect(websiteCrawlJobSchema.safeParse(rest).success).toBe(false);
  });
});
