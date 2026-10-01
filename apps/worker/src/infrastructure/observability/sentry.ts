import * as Sentry from '@sentry/node';

export interface SentrySettings {
  dsn?: string | undefined;
  environment?: string | undefined;
  nodeEnv: string;
  service: 'api' | 'worker';
}

/**
 * Starts error reporting, or does nothing at all.
 *
 * No DSN means no initialisation, which is what keeps development and CI from reporting anywhere
 * — and means a missing DSN degrades to today's behaviour (a log line) rather than a crash.
 *
 * Returns whether it started, so the caller can say so in its logs.
 */
export function initSentry(settings: SentrySettings): boolean {
  if (!settings.dsn) {
    return false;
  }

  Sentry.init({
    dsn: settings.dsn,
    environment: settings.environment ?? settings.nodeEnv,
    // Errors only. Tracing is a separate decision with its own cost, and nothing here needs it yet.
    tracesSampleRate: 0,
    // Request bodies and headers carry session cookies, Stripe payloads and user email addresses.
    // None of that is needed to fix a crash.
    sendDefaultPii: false,
    initialScope: { tags: { service: settings.service } },
  });

  return true;
}

/** Reports an exception when reporting is on, and is a no-op when it is not. */
export function captureException(exception: unknown, context?: Record<string, unknown>): void {
  if (!Sentry.isInitialized()) {
    return;
  }
  Sentry.captureException(exception, context === undefined ? undefined : { extra: context });
}
