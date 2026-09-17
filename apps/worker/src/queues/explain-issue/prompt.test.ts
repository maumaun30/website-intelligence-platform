import { describe, expect, it } from 'vitest';

import type { ExplanationInput } from './explanation-input';
import { EXPLANATION_SYSTEM_PROMPT, renderExplanationPrompt } from './prompt';

const input: ExplanationInput = {
  domain: 'acme.test',
  rule: {
    id: 'duplicate-title',
    title: 'Duplicate title',
    severity: 'warning',
    description: 'Several pages share this title.',
  },
  issueCount: 2,
  affectedPageCount: 2,
  pages: [
    {
      path: '/a',
      message: '2 pages share the title "Same"',
      evidence: { title: 'Same', duplicateCount: 2 },
      facts: null,
    },
  ],
};

describe('prompt', () => {
  it('keeps the system prompt free of request data so it caches', () => {
    expect(EXPLANATION_SYSTEM_PROMPT).not.toContain('acme.test');
    expect(EXPLANATION_SYSTEM_PROMPT.length).toBeGreaterThan(200);
  });

  it('renders the rule, counts, and pages into the user message', () => {
    const text = renderExplanationPrompt(input);

    expect(text).toContain('acme.test');
    expect(text).toContain('Duplicate title');
    expect(text).toContain('/a');
    expect(text).toContain('"duplicateCount": 2');
    expect(text).toContain('2 issues across 2 pages');
  });
});
