import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HealthStatus } from './health-status';

const healthyBody = {
  status: 'ok',
  uptimeSeconds: 12,
  version: '0.1.0',
  checks: {
    database: { status: 'up', latencyMs: 2 },
    redis: { status: 'up', latencyMs: 1 },
  },
};

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthStatus', () => {
  it('renders every dependency once the request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(healthyBody), { status: 200 }))),
    );

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
  });

  it('renders an unreachable state when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('fetch failed'))),
    );

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('Unreachable')).toBeInTheDocument();
  });

  it('renders a degraded state and surfaces the dependency error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...healthyBody,
              status: 'degraded',
              checks: {
                database: { status: 'down', latencyMs: 2000, error: 'connection refused' },
                redis: { status: 'up', latencyMs: 1 },
              },
            }),
            { status: 503 },
          ),
        ),
      ),
    );

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('connection refused')).toBeInTheDocument();
  });
});
