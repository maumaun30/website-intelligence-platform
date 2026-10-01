import { describe, expect, it, vi } from 'vitest';

import { ResendMailer } from './resend-mailer';

const message = { to: 'ada@wintel.test', subject: 'Verify your email', text: 'Open this link' };

function okResponse() {
  return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
}

describe('ResendMailer', () => {
  it('posts the message to Resend with the sender and key from config', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(okResponse()));
    const mailer = new ResendMailer(
      { apiKey: 're_key', from: 'Wintel <no-reply@wintel.app>' },
      fetchFn as unknown as typeof fetch,
    );

    await mailer.send(message);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Wintel <no-reply@wintel.app>',
      to: ['ada@wintel.test'],
      subject: 'Verify your email',
      text: 'Open this link',
    });
  });

  it('throws on a refusal so the job retries instead of reporting a send that never happened', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response('{"message":"domain not verified"}', { status: 403 })),
    );
    const mailer = new ResendMailer(
      { apiKey: 're_key', from: 'Wintel <no-reply@wintel.app>' },
      fetchFn as unknown as typeof fetch,
    );

    await expect(mailer.send(message)).rejects.toThrow(/403/);
  });

  it('keeps the provider’s own explanation in the error, and never the key', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response('{"message":"domain not verified"}', { status: 403 })),
    );
    const mailer = new ResendMailer(
      { apiKey: 're_secret_key', from: 'Wintel <no-reply@wintel.app>' },
      fetchFn as unknown as typeof fetch,
    );

    const error = await mailer.send(message).catch((caught: Error) => caught);

    expect((error as Error).message).toContain('domain not verified');
    expect((error as Error).message).not.toContain('re_secret_key');
  });
});
