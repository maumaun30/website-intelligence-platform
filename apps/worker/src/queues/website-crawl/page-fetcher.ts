import {
  CRAWLER_USER_AGENT,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
} from './crawl.constants';

export type FetchResult =
  | {
      kind: 'response';
      finalUrl: string;
      statusCode: number;
      contentType: string | null;
      byteSize: number | null;
      responseTimeMs: number;
      body: string | null;
      tooLarge: boolean;
    }
  | { kind: 'error'; error: string; responseTimeMs: number };

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function readCapped(response: Response): Promise<{ body: string | null; bytes: number }> {
  if (!response.body) {
    return { body: '', bytes: 0 };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return { body: null, bytes };
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks).toString('utf8'), bytes };
}

/**
 * One page request. Redirects are followed by hand so every hop is bounded and the final URL is
 * known; a single timeout covers the whole chain. Only HTML bodies are read, and never past the
 * size cap, so a hostile or generated response cannot exhaust memory.
 */
export class PageFetcher {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  async fetch(url: string): Promise<FetchResult> {
    const started = this.clock();
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let current = url;

    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const response = await this.fetchFn(current, {
          redirect: 'manual',
          signal,
          headers: { 'user-agent': CRAWLER_USER_AGENT, accept: 'text/html,*/*;q=0.8' },
        });

        const location = response.headers.get('location');
        if (REDIRECT_STATUSES.has(response.status) && location) {
          await response.body?.cancel();
          current = new URL(location, current).toString();
          continue;
        }

        const contentType = response.headers.get('content-type');
        const declaredLength = Number(response.headers.get('content-length'));
        const isHtml = contentType?.toLowerCase().includes('text/html') ?? false;

        if (!isHtml) {
          await response.body?.cancel();
          return {
            kind: 'response',
            finalUrl: current,
            statusCode: response.status,
            contentType,
            byteSize: Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null,
            responseTimeMs: this.clock() - started,
            body: null,
            tooLarge: false,
          };
        }

        const { body, bytes } = await readCapped(response);
        return {
          kind: 'response',
          finalUrl: current,
          statusCode: response.status,
          contentType,
          byteSize: bytes,
          responseTimeMs: this.clock() - started,
          body,
          tooLarge: body === null,
        };
      }
      return { kind: 'error', error: 'Too many redirects', responseTimeMs: this.clock() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'error', error: message, responseTimeMs: this.clock() - started };
    }
  }
}
