import { afterEach, describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => vi.fn());
const isInitialized = vi.hoisted(() => vi.fn(() => true));

vi.mock('@sentry/node', () => ({ init, captureException: capture, isInitialized }));

import { captureException, initSentry } from './sentry';

afterEach(() => {
  init.mockReset();
  capture.mockReset();
  isInitialized.mockReset();
  isInitialized.mockReturnValue(true);
});

describe('initSentry', () => {
  it('does nothing without a DSN, so development and CI report nowhere', () => {
    expect(initSentry({ nodeEnv: 'development', service: 'api' })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('starts with the DSN, tagged by service, and keeps request data out of it', () => {
    expect(
      initSentry({
        dsn: 'https://public@o1.ingest.sentry.io/2',
        environment: 'production',
        nodeEnv: 'production',
        service: 'api',
      }),
    ).toBe(true);

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@o1.ingest.sentry.io/2',
        environment: 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        initialScope: { tags: { service: 'api' } },
      }),
    );
  });

  it('falls back to NODE_ENV when no environment is named', () => {
    initSentry({
      dsn: 'https://public@o1.ingest.sentry.io/2',
      nodeEnv: 'staging',
      service: 'worker',
    });

    expect(init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'staging' }));
  });
});

describe('captureException', () => {
  it('reports with its context when reporting is on', () => {
    const error = new Error('boom');

    captureException(error, { scanId: 's1' });

    expect(capture).toHaveBeenCalledWith(error, { extra: { scanId: 's1' } });
  });

  it('stays silent when Sentry was never started', () => {
    isInitialized.mockReturnValue(false);

    captureException(new Error('boom'));

    expect(capture).not.toHaveBeenCalled();
  });
});
