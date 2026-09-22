import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Explanation } from '@wintel/types';
import type { ReactNode } from 'react';
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

const proLimits = {
  websites: 10,
  pagesPerScan: 1000,
  scanFrequencies: ['manual', 'daily', 'weekly'],
  aiExplanationsPerMonth: 100,
};

const billingState = {
  plan: 'pro',
  limits: proLimits,
  usage: { websites: 2, aiExplanationsThisMonth: 4 },
  plans: {
    free: {
      websites: 1,
      pagesPerScan: 100,
      scanFrequencies: ['manual'],
      aiExplanationsPerMonth: 0,
    },
    pro: proLimits,
    agency: {
      websites: 50,
      pagesPerScan: 10000,
      scanFrequencies: ['manual', 'daily', 'weekly'],
      aiExplanationsPerMonth: 500,
    },
  },
};

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

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
  vi.unstubAllGlobals();
});

function stubBillingFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(billingState), { status: 200 }))),
  );
}

describe('AiExplanation', () => {
  it('offers to explain when nothing was requested', () => {
    stubBillingFetch();
    renderWithQueryClient(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Explain with AI' }));

    expect(mutate).toHaveBeenCalledWith({ regenerate: false });
  });

  it('shows progress while generating', () => {
    stubBillingFetch();
    explanation = make({ status: 'running', content: null });

    renderWithQueryClient(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(screen.getByText('Generating explanation…')).toBeInTheDocument();
  });

  it('renders the explanation with a review notice and per-page fixes', () => {
    stubBillingFetch();
    explanation = make({});

    renderWithQueryClient(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(screen.getByText('One page lacks a heading.')).toBeInTheDocument();
    expect(screen.getByText('/about')).toBeInTheDocument();
    expect(screen.getByText('Add an H1 naming the team')).toBeInTheDocument();
    expect(screen.getByText('AI-generated — review before applying.')).toBeInTheDocument();
  });

  it('explains failures and friendly error codes', () => {
    stubBillingFetch();
    explanation = make({
      status: 'failed',
      content: null,
      error: 'The model declined to explain this rule',
    });
    renderWithQueryClient(<AiExplanation scanId="s1" ruleId="missing-h1" />);
    expect(screen.getByText('The model declined to explain this rule')).toBeInTheDocument();
    cleanup();

    explanation = null;
    requestError = Object.assign(new Error('x'), { status: 503, code: 'AI_UNAVAILABLE' });
    renderWithQueryClient(<AiExplanation scanId="s1" ruleId="missing-h1" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'AI explanations are not enabled for this workspace.',
    );
  });

  it('maps a stored worker refusal code to friendly text, not the raw code', () => {
    stubBillingFetch();
    explanation = make({
      status: 'failed',
      content: null,
      error: 'PLAN_AI_LIMIT',
    });

    renderWithQueryClient(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(
      screen.getByText('Your organization has used every AI explanation in its plan this month.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('PLAN_AI_LIMIT')).not.toBeInTheDocument();
  });

  it('locks the panel when the plan has no AI explanations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...billingState,
              plan: 'free',
              limits: { ...billingState.limits, aiExplanationsPerMonth: 0 },
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    renderWithQueryClient(<AiExplanation scanId="s1" ruleId="missing-h1" />);

    expect(
      await screen.findByText('AI explanations are not part of your plan.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explain with AI' })).not.toBeInTheDocument();
  });
});
