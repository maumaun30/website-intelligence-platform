import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Website } from '@wintel/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

let websites: Website[] = [];

vi.mock('@/lib/use-websites', () => ({
  useWebsites: () => ({ data: websites, isPending: false, isError: false }),
}));

import { VerificationNotice } from './verification-notice';

function website(overrides: Partial<Website>): Website {
  return {
    id: 'w1',
    name: 'Demo shop',
    domain: 'demo.test',
    verificationStatus: 'pending',
    ...overrides,
  } as Website;
}

afterEach(() => {
  cleanup();
  websites = [];
  sessionStorage.clear();
});

describe('VerificationNotice', () => {
  it('says nothing when every website is verified', () => {
    websites = [website({ verificationStatus: 'verified' })];

    const { container } = render(<VerificationNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names the single website that still needs verifying and links to it', () => {
    websites = [website({})];

    render(<VerificationNotice />);

    expect(screen.getByRole('status')).toHaveTextContent('Demo shop needs verification');
    expect(screen.getByRole('link', { name: 'Verify it' })).toHaveAttribute(
      'href',
      '/dashboard/websites/w1',
    );
  });

  it('counts them when several are waiting, and links to the list', () => {
    websites = [website({}), website({ id: 'w2', name: 'Blog' })];

    render(<VerificationNotice />);

    expect(screen.getByRole('status')).toHaveTextContent('2 websites need verification');
    expect(screen.getByRole('link', { name: 'Verify them' })).toHaveAttribute(
      'href',
      '/dashboard/websites',
    );
  });

  it('says a failed check failed, rather than calling it pending', () => {
    websites = [website({ verificationStatus: 'failed' })];

    render(<VerificationNotice />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not verify Demo shop. Check the record and try again.',
    );
  });

  it('stays dismissed for the rest of the session once dismissed', () => {
    websites = [website({})];

    const first = render(<VerificationNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    first.unmount();

    const { container } = render(<VerificationNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
