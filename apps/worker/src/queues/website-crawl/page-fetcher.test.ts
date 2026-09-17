import { describe, expect, it, vi } from 'vitest';

import { MAX_REDIRECTS, MAX_RESPONSE_BYTES } from './crawl.constants';
import { PageFetcher } from './page-fetcher';

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

describe('PageFetcher', () => {
  it('returns status, content type, size and body for an HTML page', async () => {
    const fetchFn = vi.fn().mockResolvedValue(html('<p>hi</p>'));
    const fetcher = new PageFetcher(fetchFn);

    const result = await fetcher.fetch('https://acme.test/');

    expect(result).toMatchObject({
      kind: 'response',
      finalUrl: 'https://acme.test/',
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      byteSize: 9,
      body: '<p>hi</p>',
      tooLarge: false,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://acme.test/',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('follows redirects and reports the final URL', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/new' } }))
      .mockResolvedValueOnce(html('<p>moved</p>'));
    const fetcher = new PageFetcher(fetchFn);

    const result = await fetcher.fetch('https://acme.test/old');

    expect(result).toMatchObject({
      kind: 'response',
      finalUrl: 'https://acme.test/new',
      statusCode: 200,
    });
  });

  it('gives up after too many redirects', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 302, headers: { location: '/loop' } })),
    );
    const fetcher = new PageFetcher(fetchFn);

    const result = await fetcher.fetch('https://acme.test/loop');

    expect(result).toMatchObject({ kind: 'error', error: 'Too many redirects' });
    expect(fetchFn).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it('does not read the body of non-HTML responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('%PDF', {
        headers: { 'content-type': 'application/pdf', 'content-length': '4' },
      }),
    );
    const fetcher = new PageFetcher(fetchFn);

    const result = await fetcher.fetch('https://acme.test/file.pdf');

    expect(result).toMatchObject({
      kind: 'response',
      body: null,
      byteSize: 4,
      contentType: 'application/pdf',
    });
  });

  it('discards an HTML body over the size cap', async () => {
    const fetchFn = vi.fn().mockResolvedValue(html('x'.repeat(MAX_RESPONSE_BYTES + 1)));
    const fetcher = new PageFetcher(fetchFn);

    const result = await fetcher.fetch('https://acme.test/huge');

    expect(result).toMatchObject({ kind: 'response', body: null, tooLarge: true });
  });

  it('keeps the status of an error page', async () => {
    const fetchFn = vi.fn().mockResolvedValue(html('<p>missing</p>', 404));
    const fetcher = new PageFetcher(fetchFn);

    expect(await fetcher.fetch('https://acme.test/missing')).toMatchObject({
      kind: 'response',
      statusCode: 404,
    });
  });

  it('turns a network failure into an error result', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const fetcher = new PageFetcher(fetchFn);

    expect(await fetcher.fetch('https://acme.test/')).toMatchObject({
      kind: 'error',
      error: 'ECONNREFUSED',
    });
  });
});
