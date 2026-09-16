import type { WebsiteVerifyJob } from '@wintel/types';
import { describe, expect, it, vi } from 'vitest';

import { MetaVerificationStrategy } from './meta-strategy';

const job: WebsiteVerifyJob = {
  websiteId: 'w1',
  domain: 'acme.test',
  url: 'https://acme.test',
  method: 'meta',
  token: 'tok123',
};

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
}

describe('MetaVerificationStrategy', () => {
  it('returns true when the verification meta tag is present', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        htmlResponse('<html><head><meta name="wintel-verify" content="tok123"></head></html>'),
      );
    const strategy = new MetaVerificationStrategy(fetchFn);

    expect(await strategy.verify(job)).toBe(true);
    expect(fetchFn).toHaveBeenCalled();
  });

  it('is attribute-order and whitespace tolerant', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(htmlResponse('<meta   content="tok123"   name="wintel-verify" />'));
    const strategy = new MetaVerificationStrategy(fetchFn);

    expect(await strategy.verify(job)).toBe(true);
  });

  it('returns false when the tag holds a different token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(htmlResponse('<meta name="wintel-verify" content="other">'));
    const strategy = new MetaVerificationStrategy(fetchFn);

    expect(await strategy.verify(job)).toBe(false);
  });

  it('propagates a fetch failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const strategy = new MetaVerificationStrategy(fetchFn);

    await expect(strategy.verify(job)).rejects.toThrow('ECONNREFUSED');
  });
});
