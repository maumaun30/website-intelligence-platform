import { describe, expect, it, vi } from 'vitest';

import {
  AnthropicExplanationGenerator,
  EXPLANATION_MODEL,
  EXPLANATION_OUTPUT_SCHEMA,
} from './anthropic-generator';
import type { ExplanationInput } from './explanation-input';
import { ExplanationRefusedError, InvalidExplanationError } from './generator';
import { EXPLANATION_SYSTEM_PROMPT } from './prompt';

const input: ExplanationInput = {
  domain: 'acme.test',
  rule: { id: 'missing-h1', title: 'Missing H1', severity: 'warning', description: 'd' },
  issueCount: 1,
  affectedPageCount: 1,
  pages: [{ path: '/about', message: 'no h1', evidence: {}, facts: null }],
};

const valid = {
  summary: 'One page lacks a main heading.',
  whyItMatters: 'Headings tell readers and search engines the topic.',
  fixes: Array.from({ length: 12 }, (_value, index) => ({
    path: `/p${index}`,
    action: 'Add an H1',
  })),
  generalAdvice: ['a', 'b', 'c', 'd', 'e', 'f'],
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-opus-5',
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: JSON.stringify(valid) },
    ],
    usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 700 },
    ...overrides,
  };
}

function client(result: unknown) {
  const create = vi.fn().mockResolvedValue(result);
  return { create, anthropic: { beta: { messages: { create } } } };
}

describe('AnthropicExplanationGenerator', () => {
  it('sends a cached system prompt, fallbacks, low effort, and the output schema', async () => {
    const fake = client(response());

    await new AnthropicExplanationGenerator(fake.anthropic as never).generate(input);

    expect(fake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: EXPLANATION_MODEL,
        max_tokens: 4000,
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
      }),
    );
  });

  it('returns validated, capped content with usage', async () => {
    const fake = client(response());

    const result = await new AnthropicExplanationGenerator(fake.anthropic as never).generate(input);

    expect(result.content.fixes).toHaveLength(10);
    expect(result.content.generalAdvice).toHaveLength(5);
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 300, cacheReadTokens: 700 });
    expect(result.model).toBe('claude-opus-5');
  });

  it('raises a refusal error when the model declines', async () => {
    const fake = client(response({ stop_reason: 'refusal', content: [] }));

    await expect(
      new AnthropicExplanationGenerator(fake.anthropic as never).generate(input),
    ).rejects.toBeInstanceOf(ExplanationRefusedError);
  });

  it('raises an invalid-explanation error for unparseable or mis-shaped output', async () => {
    const garbage = client(response({ content: [{ type: 'text', text: 'not json' }] }));
    await expect(
      new AnthropicExplanationGenerator(garbage.anthropic as never).generate(input),
    ).rejects.toBeInstanceOf(InvalidExplanationError);

    const wrong = client(response({ content: [{ type: 'text', text: '{"summary":"x"}' }] }));
    await expect(
      new AnthropicExplanationGenerator(wrong.anthropic as never).generate(input),
    ).rejects.toBeInstanceOf(InvalidExplanationError);
  });

  it('lets API errors propagate for retry', async () => {
    const create = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(
      new AnthropicExplanationGenerator({ beta: { messages: { create } } } as never).generate(
        input,
      ),
    ).rejects.toThrow('overloaded');
  });
});
