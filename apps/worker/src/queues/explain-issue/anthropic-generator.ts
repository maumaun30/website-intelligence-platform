import Anthropic from '@anthropic-ai/sdk';
import {
  EXPLANATION_MAX_ADVICE,
  EXPLANATION_MAX_FIXES,
  type ExplanationContent,
  explanationContentSchema,
} from '@wintel/types';

import type { ExplanationInput } from './explanation-input';
import {
  ExplanationRefusedError,
  type ExplanationGenerator,
  type GeneratedExplanation,
  InvalidExplanationError,
} from './generator';
import { EXPLANATION_SYSTEM_PROMPT, renderExplanationPrompt } from './prompt';

export const EXPLANATION_MODEL = 'claude-opus-5';
const MAX_TOKENS = 4000;

/** JSON schema for structured output; mirrors `explanationContentSchema`. */
export const EXPLANATION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'whyItMatters', 'fixes', 'generalAdvice'],
  properties: {
    summary: { type: 'string' },
    whyItMatters: { type: 'string' },
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'action'],
        properties: { path: { type: 'string' }, action: { type: 'string' } },
      },
    },
    generalAdvice: { type: 'array', items: { type: 'string' } },
  },
} as const;

export function clampExplanation(content: ExplanationContent): ExplanationContent {
  return {
    ...content,
    fixes: content.fixes.slice(0, EXPLANATION_MAX_FIXES),
    generalAdvice: content.generalAdvice.slice(0, EXPLANATION_MAX_ADVICE),
  };
}

/**
 * Claude Opus 5 at low effort with structured output. The system prompt is cached; refusals get
 * server-side fallbacks first and only then surface as `ExplanationRefusedError`.
 */
export class AnthropicExplanationGenerator implements ExplanationGenerator {
  constructor(private readonly client: Anthropic) {}

  async generate(input: ExplanationInput): Promise<GeneratedExplanation> {
    const response = await this.client.beta.messages.create({
      model: EXPLANATION_MODEL,
      max_tokens: MAX_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: EXPLANATION_OUTPUT_SCHEMA },
      },
      system: [
        { type: 'text', text: EXPLANATION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: renderExplanationPrompt(input) }],
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') {
      throw new ExplanationRefusedError();
    }

    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      throw new InvalidExplanationError('no text content');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text.text);
    } catch {
      throw new InvalidExplanationError('output was not JSON');
    }
    const parsed = explanationContentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidExplanationError('output did not match the schema');
    }

    return {
      content: clampExplanation(parsed.data),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
