import type { EmailJob } from '@wintel/types';

import type { OutgoingEmail } from '../../infrastructure/mailer/mailer.service';

/**
 * Renders a transactional email from its job. Deliberately plain text for the foundation of the
 * auth slice — the point is a working, testable pipeline, not markup. Rich templates can replace
 * this without touching the processor or the queue contract.
 */
export function renderEmail(job: EmailJob): OutgoingEmail {
  switch (job.type) {
    case 'verification':
      return {
        to: job.to,
        subject: 'Verify your email address',
        text: `Welcome to the Website Intelligence Platform.\n\nConfirm your email address to finish signing up:\n\n${job.url}\n\nIf you did not create an account, you can ignore this message.\n`,
      };
    case 'invitation':
      return {
        to: job.to,
        subject: `You have been invited to ${job.organizationName}`,
        text: `${job.invitedByName} invited you to join ${job.organizationName} on the Website Intelligence Platform.\n\nAccept the invitation:\n\n${job.url}\n`,
      };
  }
}
