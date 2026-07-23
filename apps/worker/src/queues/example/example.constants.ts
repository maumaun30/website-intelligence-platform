/** Name of the placeholder queue proving the job pipeline. Replaced by real queues per slice. */
export const EXAMPLE_QUEUE = 'example';

export interface ExampleJobData {
  message: string;
}

export interface ExampleJobResult {
  message: string;
  processedAt: string;
}

/** Redis key holding a processed job's result, so a caller can observe the effect of a job. */
export function exampleResultKey(jobId: string): string {
  return `example:result:${jobId}`;
}

/** Results are a debugging aid, not durable state — five minutes is plenty. */
export const EXAMPLE_RESULT_TTL_SECONDS = 300;
