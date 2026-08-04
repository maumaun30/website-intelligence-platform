import { z } from 'zod';

import { VERIFICATION_METHODS } from './website';

/** Name of the queue carrying website ownership-verification jobs. API produces; worker consumes. */
export const WEBSITE_VERIFY_QUEUE = 'website-verify';

/**
 * The payload the worker needs to check ownership without re-reading the database: which site,
 * which host (for DNS), which URL (for meta fetch), which method, and the token to look for. The
 * API enqueues these; the worker validates against this same schema before acting.
 */
export const websiteVerifyJobSchema = z.object({
  websiteId: z.string(),
  domain: z.string(),
  url: z.string(),
  method: z.enum(VERIFICATION_METHODS),
  token: z.string(),
});

export type WebsiteVerifyJob = z.infer<typeof websiteVerifyJobSchema>;
