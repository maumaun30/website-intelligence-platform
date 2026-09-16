import type { WebsiteVerifyJob } from '@wintel/types';
import { describe, expect, it, vi } from 'vitest';

import { DnsVerificationStrategy } from './dns-strategy';

const job: WebsiteVerifyJob = {
  websiteId: 'w1',
  domain: 'acme.test',
  url: 'https://acme.test',
  method: 'dns',
  token: 'tok123',
};

describe('DnsVerificationStrategy', () => {
  it('returns true when a TXT record holds the token', async () => {
    const resolveTxt = vi.fn().mockResolvedValue([['unrelated'], ['wintel-verify=tok123']]);
    const strategy = new DnsVerificationStrategy(resolveTxt);

    expect(await strategy.verify(job)).toBe(true);
    expect(resolveTxt).toHaveBeenCalledWith('acme.test');
  });

  it('joins chunked TXT segments before comparing', async () => {
    const resolveTxt = vi.fn().mockResolvedValue([['wintel-verify=', 'tok123']]);
    const strategy = new DnsVerificationStrategy(resolveTxt);

    expect(await strategy.verify(job)).toBe(true);
  });

  it('returns false when no record matches', async () => {
    const resolveTxt = vi.fn().mockResolvedValue([['nope']]);
    const strategy = new DnsVerificationStrategy(resolveTxt);

    expect(await strategy.verify(job)).toBe(false);
  });

  it('returns false when the domain has no TXT records at all', async () => {
    const resolveTxt = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('queryTxt ENODATA'), { code: 'ENODATA' }));
    const strategy = new DnsVerificationStrategy(resolveTxt);

    expect(await strategy.verify(job)).toBe(false);
  });

  it('returns false when the domain does not exist', async () => {
    const resolveTxt = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' }));
    const strategy = new DnsVerificationStrategy(resolveTxt);

    expect(await strategy.verify(job)).toBe(false);
  });

  it('propagates an infra error (does not swallow to false)', async () => {
    const resolveTxt = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('queryTxt SERVFAIL'), { code: 'SERVFAIL' }));
    const strategy = new DnsVerificationStrategy(resolveTxt);

    await expect(strategy.verify(job)).rejects.toThrow('SERVFAIL');
  });
});
