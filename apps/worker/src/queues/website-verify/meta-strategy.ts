import type { WebsiteVerifyJob } from '@wintel/types';

import type { VerificationStrategy } from './verification-strategy';

type FetchFn = typeof fetch;

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_HTML_BYTES = 1_000_000;

/**
 * Confirms ownership by fetching the site's URL and looking for
 * `<meta name="wintel-verify" content="<token>">`. Tolerant of attribute order. A network failure
 * throws (BullMQ retries); a page that loads without the tag is a definite `false`. The response is
 * truncated so a hostile server cannot stream us out of memory.
 */
export class MetaVerificationStrategy implements VerificationStrategy {
  constructor(private readonly fetchFn: FetchFn = fetch) {}

  async verify(job: WebsiteVerifyJob): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await this.fetchFn(job.url, { signal: controller.signal });
      const html = (await response.text()).slice(0, MAX_HTML_BYTES);

      return this.hasVerificationTag(html, job.token);
    } finally {
      clearTimeout(timer);
    }
  }

  private hasVerificationTag(html: string, token: string): boolean {
    const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

    return metaTags.some((tag) => {
      const name = tag.match(/name\s*=\s*["']([^"']*)["']/i)?.[1];
      const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];

      return name === 'wintel-verify' && content === token;
    });
  }
}
