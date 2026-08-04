import { describe, expect, it } from 'vitest';

import { WEBSITE_VERIFY_QUEUE, websiteVerifyJobSchema } from './website-jobs';

describe('websiteVerifyJobSchema', () => {
  it('names the queue', () => {
    expect(WEBSITE_VERIFY_QUEUE).toBe('website-verify');
  });

  it('accepts a well-formed job', () => {
    const parsed = websiteVerifyJobSchema.safeParse({
      websiteId: 'w1',
      domain: 'acme.test',
      url: 'https://acme.test',
      method: 'dns',
      token: 'tok',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown method', () => {
    const parsed = websiteVerifyJobSchema.safeParse({
      websiteId: 'w1',
      domain: 'acme.test',
      url: 'https://acme.test',
      method: 'smoke-signal',
      token: 'tok',
    });
    expect(parsed.success).toBe(false);
  });
});
