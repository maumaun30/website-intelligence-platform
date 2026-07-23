import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  EXAMPLE_QUEUE,
  EXAMPLE_RESULT_TTL_SECONDS,
  type ExampleJobData,
  type ExampleJobResult,
  exampleResultKey,
} from './example.constants';

/**
 * Placeholder processor. It exists so the enqueue-process-observe path is exercised by a test
 * before a real queue (crawl, audit, report) depends on it. Delete it once one exists.
 */
@Processor(EXAMPLE_QUEUE)
export class ExampleProcessor extends WorkerHost {
  constructor(
    private readonly redis: RedisService,
    @InjectPinoLogger(ExampleProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job<ExampleJobData>): Promise<ExampleJobResult> {
    const result: ExampleJobResult = {
      message: job.data.message,
      processedAt: new Date().toISOString(),
    };

    await this.redis.client.set(
      exampleResultKey(String(job.id)),
      JSON.stringify(result),
      'EX',
      EXAMPLE_RESULT_TTL_SECONDS,
    );

    this.logger.info({ jobId: job.id }, 'Processed example job');

    return result;
  }
}
