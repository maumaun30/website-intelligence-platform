'use client';

import type { Website } from '@wintel/types';
import { use, useState } from 'react';

import { AuditSection } from '@/components/audit-section';
import { ScanConfigForm } from '@/components/scan-config-form';
import { ScanPagesTable } from '@/components/scan-pages-table';
import { ScanPanel } from '@/components/scan-panel';
import { VerificationPanel } from '@/components/verification-panel';
import { WebsiteScoreTile } from '@/components/website-score-tile';
import { describeNextScan } from '@/lib/schedule-text';
import { useScans } from '@/lib/use-scans';
import { useWebsite } from '@/lib/use-websites';

const TABS = ['audit', 'pages', 'verification', 'settings'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  audit: 'Audit',
  pages: 'Pages',
  verification: 'Verification',
  settings: 'Scan settings',
};

const VERIFICATION_PILL = {
  verified: 'bg-success-soft text-success-soft-foreground',
  pending: 'bg-warning-soft text-warning-soft-foreground',
  failed: 'bg-destructive-soft text-destructive-soft-foreground',
} as const;

function WebsiteHeader({ website }: { website: Website }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 flex-none place-items-center rounded-lg border border-border bg-muted text-lg font-semibold text-muted-foreground"
        >
          {website.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
              {website.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${VERIFICATION_PILL[website.verificationStatus]}`}
            >
              {website.verificationStatus}
            </span>
          </div>
          <span className="font-mono text-[13px] text-muted-foreground">
            {website.url} · {describeNextScan(website.nextScanAt, new Date()).toLowerCase()} · max{' '}
            {website.maxPages} pages
          </span>
        </div>
      </div>
    </header>
  );
}

export default function WebsiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isPending, isError } = useWebsite(id);
  const scans = useScans(id);
  const [tab, setTab] = useState<Tab>('audit');

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (isError || !data) {
    return <p className="text-sm text-destructive">Could not load this website.</p>;
  }

  const latest = scans.data?.[0];

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader website={data} />

      <div
        role="tablist"
        aria-label="Website sections"
        className="flex gap-7 border-b border-border"
      >
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
            className={`-mb-px pb-3 text-sm transition-colors ease-out ${
              tab === option
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[option]}
            {option === 'pages' && latest !== undefined ? (
              <span className="tnum ml-1.5 font-mono text-xs">{latest.pagesCrawled}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'audit' ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <WebsiteScoreTile websiteId={data.id} />
            <ScanPanel website={data} />
          </div>
          {latest?.status === 'completed' ? (
            <AuditSection scanId={latest.id} />
          ) : (
            <p className="text-sm text-muted-foreground">
              The audit appears here once a scan finishes.
            </p>
          )}
        </div>
      ) : null}

      {tab === 'pages' ? (
        latest === undefined ? (
          <p className="text-sm text-muted-foreground">No scans yet.</p>
        ) : (
          <ScanPagesTable scanId={latest.id} pagesCrawled={latest.pagesCrawled} />
        )
      ) : null}

      {tab === 'verification' ? <VerificationPanel website={data} /> : null}

      {tab === 'settings' ? (
        <div className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-6">
          <h2 className="text-[15px] font-semibold">Scan settings</h2>
          <ScanConfigForm website={data} />
        </div>
      ) : null}
    </div>
  );
}
