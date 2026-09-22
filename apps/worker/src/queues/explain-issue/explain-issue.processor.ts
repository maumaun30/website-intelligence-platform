import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Prisma } from '@wintel/database';
import {
  EXPLAIN_ISSUE_QUEUE,
  evaluateQuota,
  explainIssueJobSchema,
  utcMonthKey,
} from '@wintel/types';
import { type Job, UnrecoverableError } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { buildExplanationInput } from './explanation-input';
import {
  EXPLANATION_GENERATOR,
  type ExplanationGenerator,
  ExplanationRefusedError,
  ExplanationsNotConfiguredError,
  InvalidExplanationError,
} from './generator';

export const EXPLANATION_INPUT_BUILDER = Symbol('EXPLANATION_INPUT_BUILDER');

function isPermanent(error: unknown): boolean {
  return (
    error instanceof ExplanationRefusedError ||
    error instanceof InvalidExplanationError ||
    error instanceof ExplanationsNotConfiguredError
  );
}

/**
 * Generates one explanation. Permanent failures (refusal, invalid output, not configured) fail
 * immediately and tell BullMQ not to retry; transient ones go back to `queued` for the single retry
 * and fail on the final attempt.
 */
@Processor(EXPLAIN_ISSUE_QUEUE)
export class ExplainIssueProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXPLANATION_GENERATOR) private readonly generator: ExplanationGenerator,
    @Inject(EXPLANATION_INPUT_BUILDER) private readonly buildInput: typeof buildExplanationInput,
    @InjectPinoLogger(ExplainIssueProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { explanationId } = explainIssueJobSchema.parse(job.data);
    const explanations = this.prisma.client.explanation;

    const { count } = await explanations.updateMany({
      where: { id: explanationId, status: 'queued' },
      data: { status: 'running', error: null },
    });
    if (count === 0) {
      this.logger.warn({ explanationId }, 'Skipping explanation job that is not queued');
      return;
    }

    const explanation = await explanations.findUniqueOrThrow({ where: { id: explanationId } });

    // The API took this job's unit from the month's counter when it queued the job, so the job may
    // run while the counter is at most the limit; above it means a downgrade since then, and a job
    // queued before a downgrade must not spend. Evaluating the count *before* this job reuses the
    // shared rule verbatim, including PLAN_AI_LOCKED for a plan with no AI at all.
    const [organization, usage] = await Promise.all([
      this.prisma.client.organization.findUnique({
        where: { id: explanation.organizationId },
        select: { plan: true },
      }),
      this.prisma.client.organizationUsage.findUnique({
        where: {
          organizationId_month: {
            organizationId: explanation.organizationId,
            month: utcMonthKey(new Date()),
          },
        },
        select: { aiExplanations: true },
      }),
    ]);
    const decision = evaluateQuota({
      plan: organization?.plan ?? 'free',
      kind: 'aiExplanations',
      current: (usage?.aiExplanations ?? 0) - 1,
    });
    if (!decision.allowed) {
      await explanations.update({
        where: { id: explanationId },
        data: { status: 'failed', error: decision.code },
      });
      throw new UnrecoverableError(decision.code);
    }

    try {
      const input = await this.buildInput(this.prisma.client, explanation);
      const result = await this.generator.generate(input);
      await explanations.update({
        where: { id: explanationId },
        data: {
          status: 'completed',
          content: result.content as unknown as Prisma.InputJsonObject,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          error: null,
        },
      });
      this.logger.info(
        { explanationId, model: result.model, ...result.usage },
        'Explanation generated',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const permanent = isPermanent(error);

      await explanations.update({
        where: { id: explanationId },
        data:
          permanent || finalAttempt ? { status: 'failed', error: message } : { status: 'queued' },
      });
      this.logger.error(
        { explanationId, err: error, permanent, finalAttempt },
        'Explanation failed',
      );

      if (permanent) {
        throw new UnrecoverableError(message);
      }
      throw error;
    }
  }
}
