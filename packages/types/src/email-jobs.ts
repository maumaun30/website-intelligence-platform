import { z } from 'zod';

/** Name of the queue carrying transactional email jobs. Shared by the API (producer) and worker. */
export const EMAIL_QUEUE = 'email';

/**
 * The payload of a transactional email job. A discriminated union keeps each email type's data
 * explicit and lets the worker render the right template without guessing. The API enqueues these;
 * the worker validates against this same schema before sending, so the two never drift.
 */
export const emailJobSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('verification'),
    to: z.email(),
    url: z.string(),
  }),
  z.object({
    type: z.literal('invitation'),
    to: z.email(),
    organizationName: z.string(),
    invitedByName: z.string(),
    url: z.string(),
  }),
]);

export type EmailJob = z.infer<typeof emailJobSchema>;
export type EmailJobType = EmailJob['type'];
