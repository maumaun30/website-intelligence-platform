import type { ExplanationInput } from './explanation-input';
import {
  type ExplanationGenerator,
  ExplanationsNotConfiguredError,
  type GeneratedExplanation,
} from './generator';

/**
 * Deterministic stand-in for local development and verification without credentials. Output is
 * labeled so it can never be mistaken for model advice. Only used when explicitly configured.
 */
export class FakeExplanationGenerator implements ExplanationGenerator {
  generate(input: ExplanationInput): Promise<GeneratedExplanation> {
    return Promise.resolve({
      model: 'fake',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      content: {
        summary: `[Local fake generator] ${input.rule.title}: ${input.issueCount} issues across ${input.affectedPageCount} pages on ${input.domain}.`,
        whyItMatters: `[Local fake generator] ${input.rule.description}`,
        fixes: input.pages.map((page) => ({
          path: page.path,
          action: `[Local fake generator] Resolve: ${page.message}`,
        })),
        generalAdvice: [
          '[Local fake generator] Configure ANTHROPIC_API_KEY for real explanations.',
        ],
      },
    });
  }
}

export class UnconfiguredExplanationGenerator implements ExplanationGenerator {
  generate(_input: ExplanationInput): Promise<GeneratedExplanation> {
    return Promise.reject(new ExplanationsNotConfiguredError());
  }
}
