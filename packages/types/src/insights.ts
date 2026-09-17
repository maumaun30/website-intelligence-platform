import { z } from 'zod';

import { AUDIT_RULE_IDS, ISSUE_SEVERITIES, type IssueSeverity } from './audit';
import { SCAN_TRIGGERS, SCAN_STATUSES } from './scan';
import { SCAN_FREQUENCIES, VERIFICATION_STATUSES } from './website';

/** Points removed when every page has at least one issue of that severity. */
export const HEALTH_SCORE_WEIGHTS: Readonly<Record<IssueSeverity, number>> = {
  critical: 60,
  warning: 30,
  notice: 10,
};

/**
 * 0–100 health score from the share of pages affected at each severity. A page counts once per
 * severity however many issues it has, so small and large sites stay comparable.
 */
export function computeHealthScore(
  affectedPages: Record<IssueSeverity, number>,
  pageCount: number,
): number | null {
  if (pageCount <= 0) {
    return null;
  }
  const penalty = ISSUE_SEVERITIES.reduce(
    (sum, severity) =>
      sum +
      HEALTH_SCORE_WEIGHTS[severity] * (Math.min(affectedPages[severity], pageCount) / pageCount),
    0,
  );
  return Math.max(0, Math.round(100 - penalty));
}

export type ScoreBand = 'good' | 'fair' | 'poor';

export function scoreBand(score: number | null): ScoreBand | null {
  if (score === null) {
    return null;
  }
  return score >= 90 ? 'good' : score >= 70 ? 'fair' : 'poor';
}

/** Identifies "the same problem" across scans: page ids change every crawl, paths do not. */
export function issueFingerprint(
  ruleId: string,
  path: string,
  evidence: Record<string, unknown>,
): string {
  const target = typeof evidence.targetUrl === 'string' ? evidence.targetUrl : '';
  return `${ruleId}|${path}|${target}`;
}

export interface FingerprintedIssue {
  fingerprint: string;
  ruleId: string;
  severity: IssueSeverity;
  message: string;
  path: string;
}

function uniqueByFingerprint(issues: FingerprintedIssue[]): Map<string, FingerprintedIssue> {
  const map = new Map<string, FingerprintedIssue>();
  for (const issue of issues) {
    if (!map.has(issue.fingerprint)) {
      map.set(issue.fingerprint, issue);
    }
  }
  return map;
}

export function diffIssues(
  current: FingerprintedIssue[],
  baseline: FingerprintedIssue[],
): { newIssues: FingerprintedIssue[]; fixedIssues: FingerprintedIssue[] } {
  const currentMap = uniqueByFingerprint(current);
  const baselineMap = uniqueByFingerprint(baseline);
  return {
    newIssues: [...currentMap.values()].filter((issue) => !baselineMap.has(issue.fingerprint)),
    fixedIssues: [...baselineMap.values()].filter((issue) => !currentMap.has(issue.fingerprint)),
  };
}

export const ISSUE_CHANGE_KINDS = ['new', 'fixed'] as const;
export type IssueChangeKind = (typeof ISSUE_CHANGE_KINDS)[number];

export const issueChangeSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  kind: z.enum(ISSUE_CHANGE_KINDS),
  ruleId: z.enum(AUDIT_RULE_IDS),
  severity: z.enum(ISSUE_SEVERITIES),
  path: z.string(),
  message: z.string(),
});

export const issueChangeListQuerySchema = z.object({
  kind: z.enum(ISSUE_CHANGE_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const issueChangeListSchema = z.object({
  items: z.array(issueChangeSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const TREND_DEFAULT_LIMIT = 30;
export const TREND_MAX_LIMIT = 100;

export const trendQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(TREND_MAX_LIMIT).default(TREND_DEFAULT_LIMIT),
});

/** One completed audit in a website's history. */
export const trendPointSchema = z.object({
  auditId: z.string(),
  scanId: z.string(),
  finishedAt: z.string(),
  trigger: z.enum(SCAN_TRIGGERS),
  score: z.number().int().nullable(),
  criticalCount: z.number().int(),
  warningCount: z.number().int(),
  noticeCount: z.number().int(),
});

/** One website on the organization overview. Audit fields are null until a completed audit exists. */
export const overviewRowSchema = z.object({
  websiteId: z.string(),
  name: z.string(),
  domain: z.string(),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  scanFrequency: z.enum(SCAN_FREQUENCIES),
  nextScanAt: z.string().nullable(),
  score: z.number().int().nullable(),
  scoreDelta: z.number().int().nullable(),
  criticalCount: z.number().int().nullable(),
  auditedAt: z.string().nullable(),
  lastScan: z
    .object({
      id: z.string(),
      status: z.enum(SCAN_STATUSES),
      trigger: z.enum(SCAN_TRIGGERS),
      createdAt: z.string(),
    })
    .nullable(),
});

export type IssueChange = z.infer<typeof issueChangeSchema>;
export type IssueChangeListQuery = z.infer<typeof issueChangeListQuerySchema>;
export type IssueChangeList = z.infer<typeof issueChangeListSchema>;
export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type TrendPoint = z.infer<typeof trendPointSchema>;
export type OverviewRow = z.infer<typeof overviewRowSchema>;
