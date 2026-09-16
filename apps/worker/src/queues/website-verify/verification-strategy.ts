import type { WebsiteVerifyJob } from '@wintel/types';

/** A single ownership-proof method. Returns whether the token was found; throws only on infra faults. */
export interface VerificationStrategy {
  verify(job: WebsiteVerifyJob): Promise<boolean>;
}
