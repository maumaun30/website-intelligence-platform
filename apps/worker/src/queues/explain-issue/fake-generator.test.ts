import { describe, expect, it } from 'vitest';

import type { ExplanationInput } from './explanation-input';
import { FakeExplanationGenerator, UnconfiguredExplanationGenerator } from './fake-generator';
import { ExplanationsNotConfiguredError } from './generator';

const input: ExplanationInput = {
  domain: 'acme.test',
  rule: {
    id: 'noindex',
    title: 'Excluded from search (noindex)',
    severity: 'notice',
    description: 'd',
  },
  issueCount: 1,
  affectedPageCount: 1,
  pages: [{ path: '/hidden', message: 'noindex', evidence: {}, facts: null }],
};

describe('FakeExplanationGenerator', () => {
  it('returns deterministic, visibly labeled content per page', async () => {
    const first = await new FakeExplanationGenerator().generate(input);
    const second = await new FakeExplanationGenerator().generate(input);

    expect(first).toEqual(second);
    expect(first.model).toBe('fake');
    expect(first.content.summary).toContain('[Local fake generator]');
    expect(first.content.fixes).toEqual([{ path: '/hidden', action: expect.any(String) }]);
  });
});

describe('UnconfiguredExplanationGenerator', () => {
  it('always fails as not configured', async () => {
    await expect(new UnconfiguredExplanationGenerator().generate(input)).rejects.toBeInstanceOf(
      ExplanationsNotConfiguredError,
    );
  });
});
