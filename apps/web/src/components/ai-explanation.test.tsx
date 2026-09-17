import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Explanation } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
let explanation: Explanation | null = null;
let requestError: unknown = null;

vi.mock('@/lib/use-explanations', () => ({
  isActiveExplanation: (value: Explanation | null) =>
    value?.status === 'queued' || value?.status === 'running',
  useExplanation: () => ({ data: explanation, isPending: false, isError: false }),
  useRequestExplanation: () => ({ mutate, isPending: false, error: requestError }),
}));

import { AiExplanation } from './ai-explanation';

function make(overrides: Partial<Explanation>): Explanation {
  return {
    id: 'e1',
    auditId: 'a1',
    ruleId: 'missing-h1',
    status: 'completed',
    model: 'claude-opus-5',
    error: null,
    requestedAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    content: {
      summary: 'One page lacks a heading.',
      whyItMatters: 'Headings convey the topic.',
      fixes: [{ path: '/about', action: 'Add an H1 naming the team' }],
      generalAdvice: ['Use one H1 per page'],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mutate.mockReset();
  explanation = null;
  requestError = null;
});

describe('AiExplanation', () => {
  it('offers to explain when nothing was requested', () => {
    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Explain with AI' }));

    expect(mutate).toHaveBeenCalledWith({ regenerate: false });
  });

  it('shows progress while generating', () => {
    explanation = make({ status: 'running', content: null });

    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(screen.getByText('Generating explanation…')).toBeInTheDocument();
  });

  it('renders the explanation with a review notice and per-page fixes', () => {
    explanation = make({});

    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(screen.getByText('One page lacks a heading.')).toBeInTheDocument();
    expect(screen.getByText('/about')).toBeInTheDocument();
    expect(screen.getByText('Add an H1 naming the team')).toBeInTheDocument();
    expect(screen.getByText('AI-generated — review before applying.')).toBeInTheDocument();
  });

  it('explains failures and friendly error codes', () => {
    explanation = make({
      status: 'failed',
      content: null,
      error: 'The model declined to explain this rule',
    });
    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);
    expect(screen.getByText('The model declined to explain this rule')).toBeInTheDocument();
    cleanup();

    explanation = null;
    requestError = Object.assign(new Error('x'), { status: 503, code: 'AI_UNAVAILABLE' });
    render(<AiExplanation scanId="s1" ruleId="missing-h1" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'AI explanations are not enabled for this workspace.',
    );
  });
});
