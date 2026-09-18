import { describe, expect, it } from 'vitest';

import {
  explainIssueJobSchema,
  explanationContentSchema,
  requestExplanationInputSchema,
} from './explanations';

describe('explanationContentSchema', () => {
  it('accepts a complete explanation', () => {
    expect(
      explanationContentSchema.safeParse({
        summary: 's',
        whyItMatters: 'w',
        fixes: [{ path: '/about', action: 'Add a unique title' }],
        generalAdvice: ['Keep titles unique'],
      }).success,
    ).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(explanationContentSchema.safeParse({ summary: 's' }).success).toBe(false);
  });
});

describe('requestExplanationInputSchema', () => {
  it('defaults regenerate to false and rejects unknown rules', () => {
    expect(requestExplanationInputSchema.parse({ ruleId: 'missing-h1' })).toEqual({
      ruleId: 'missing-h1',
      regenerate: false,
    });
    expect(requestExplanationInputSchema.safeParse({ ruleId: 'nope' }).success).toBe(false);
  });
});

describe('explainIssueJobSchema', () => {
  it('requires the explanation id', () => {
    expect(explainIssueJobSchema.safeParse({}).success).toBe(false);
  });
});
