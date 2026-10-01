/** One transactional email, in the only shape the templates produce. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** What every transport implements, so processors depend on `send` and not on a vendor. */
export interface Mailer {
  send(message: OutgoingEmail): Promise<void>;
}
