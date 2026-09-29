import { describe, expect, it, vi } from 'vitest';

import { BlockedTargetError, createGuardedFetch } from './guarded-fetch';

function setup(addresses: Record<string, string[]>, allowPrivateTargets = false) {
  const inner = vi.fn(() => Promise.resolve(new Response('ok')));
  const lookup = vi.fn((hostname: string) => Promise.resolve(addresses[hostname] ?? []));
  const guarded = createGuardedFetch({
    allowPrivateTargets,
    lookup,
    fetchFn: inner as unknown as typeof fetch,
  });
  return { guarded, inner, lookup };
}

describe('createGuardedFetch', () => {
  it('fetches a public host', async () => {
    const { guarded, inner } = setup({ 'example.com': ['93.184.216.34'] });

    await expect(guarded('https://example.com/page')).resolves.toBeInstanceOf(Response);
    expect(inner).toHaveBeenCalled();
  });

  it('refuses a host that resolves to a private address', async () => {
    const { guarded, inner } = setup({ 'sneaky.test': ['10.0.0.5'] });

    await expect(guarded('https://sneaky.test/')).rejects.toBeInstanceOf(BlockedTargetError);
    expect(inner).not.toHaveBeenCalled();
  });

  it('refuses the cloud metadata address however it is reached', async () => {
    const { guarded } = setup({ 'metadata.test': ['169.254.169.254'] });

    await expect(guarded('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(
      BlockedTargetError,
    );
    await expect(guarded('http://metadata.test/')).rejects.toBeInstanceOf(BlockedTargetError);
  });

  it('refuses a host where only one of several addresses is private', async () => {
    // A name that answers with both is the classic way past a first-address-only check.
    const { guarded, inner } = setup({ 'mixed.test': ['93.184.216.34', '127.0.0.1'] });

    await expect(guarded('https://mixed.test/')).rejects.toBeInstanceOf(BlockedTargetError);
    expect(inner).not.toHaveBeenCalled();
  });

  it('refuses a host that resolves to nothing', async () => {
    const { guarded } = setup({});

    await expect(guarded('https://nowhere.test/')).rejects.toBeInstanceOf(BlockedTargetError);
  });

  it('refuses schemes that are not http or https', async () => {
    const { guarded, inner } = setup({});

    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com/']) {
      await expect(guarded(url)).rejects.toBeInstanceOf(BlockedTargetError);
    }
    expect(inner).not.toHaveBeenCalled();
  });

  it('refuses localhost without asking DNS at all', async () => {
    const { guarded, lookup } = setup({});

    await expect(guarded('http://localhost:8081/')).rejects.toBeInstanceOf(BlockedTargetError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('checks every request it is given, which is what covers redirect hops', async () => {
    const { guarded } = setup({ 'good.test': ['93.184.216.34'], 'bad.test': ['192.168.1.1'] });

    await expect(guarded('https://good.test/')).resolves.toBeInstanceOf(Response);
    // The crawler follows redirects by calling this again with the new URL.
    await expect(guarded('https://bad.test/')).rejects.toBeInstanceOf(BlockedTargetError);
  });

  it('accepts a Request object as well as a string', async () => {
    const { guarded } = setup({ 'good.test': ['93.184.216.34'] });

    await expect(guarded(new Request('https://good.test/'))).resolves.toBeInstanceOf(Response);
  });

  it('lets local addresses through only when development explicitly allows it', async () => {
    const { guarded, inner } = setup({ localhost: ['127.0.0.1'] }, true);

    await expect(guarded('http://localhost:8081/')).resolves.toBeInstanceOf(Response);
    expect(inner).toHaveBeenCalled();
  });

  it('still refuses a non-http scheme even when local targets are allowed', async () => {
    const { guarded } = setup({}, true);

    await expect(guarded('file:///etc/passwd')).rejects.toBeInstanceOf(BlockedTargetError);
  });
});
