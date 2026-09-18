import type { ExplanationContent } from '@wintel/types';

import type { ExplanationInput } from './explanation-input';

export interface GeneratedExplanation {
  content: ExplanationContent;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

/** Produces an explanation for one rule. Implementations: Anthropic, local fake, unconfigured. */
export interface ExplanationGenerator {
  generate(input: ExplanationInput): Promise<GeneratedExplanation>;
}

export const EXPLANATION_GENERATOR = Symbol('EXPLANATION_GENERATOR');

/** The model declined, even after server-side fallbacks. Not retried. */
export class ExplanationRefusedError extends Error {
  constructor() {
    super('The model declined to explain this rule');
    this.name = 'ExplanationRefusedError';
  }
}

/** The model's output did not match the explanation schema. Not retried. */
export class InvalidExplanationError extends Error {
  constructor(detail: string) {
    super(`The model returned an invalid explanation: ${detail}`);
    this.name = 'InvalidExplanationError';
  }
}

/** No provider is configured (no API key). Not retried. */
export class ExplanationsNotConfiguredError extends Error {
  constructor() {
    super('AI explanations are not configured');
    this.name = 'ExplanationsNotConfiguredError';
  }
}
