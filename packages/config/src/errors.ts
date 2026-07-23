/**
 * Thrown when a process starts with an environment that does not satisfy its schema.
 * Always fatal: a process that cannot trust its configuration must not serve traffic.
 */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}
