import Anthropic from '@anthropic-ai/sdk';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { WorkerEnv } from '@wintel/config';
import { EXPLAIN_ISSUE_QUEUE } from '@wintel/types';

import { WORKER_ENV } from '../../config/worker-config.module';
import { AnthropicExplanationGenerator } from './anthropic-generator';
import { EXPLANATION_INPUT_BUILDER, ExplainIssueProcessor } from './explain-issue.processor';
import { buildExplanationInput } from './explanation-input';
import { FakeExplanationGenerator, UnconfiguredExplanationGenerator } from './fake-generator';
import { EXPLANATION_GENERATOR, type ExplanationGenerator } from './generator';

function createGenerator(env: WorkerEnv): ExplanationGenerator {
  if (env.AI_EXPLANATION_PROVIDER === 'fake') {
    return new FakeExplanationGenerator();
  }
  if (!env.ANTHROPIC_API_KEY) {
    return new UnconfiguredExplanationGenerator();
  }
  return new AnthropicExplanationGenerator(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
}

/** Explanation generation; the provider is chosen once from configuration. */
@Module({
  imports: [BullModule.registerQueue({ name: EXPLAIN_ISSUE_QUEUE })],
  providers: [
    ExplainIssueProcessor,
    { provide: EXPLANATION_GENERATOR, inject: [WORKER_ENV], useFactory: createGenerator },
    { provide: EXPLANATION_INPUT_BUILDER, useValue: buildExplanationInput },
  ],
})
export class ExplainIssueModule {}
