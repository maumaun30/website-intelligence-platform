import { z } from 'zod';

export const AUDIT_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
/** An audit in one of these states may still change; the web app polls it. */
export const ACTIVE_AUDIT_STATUSES = ['queued', 'running'] as const;
/** Ordered most to least severe; Postgres sorts the enum in this order too. */
export const ISSUE_SEVERITIES = ['critical', 'warning', 'notice'] as const;

export const AUDIT_RULE_IDS = [
  'broken-internal-link',
  'server-error',
  'client-error',
  'missing-title',
  'duplicate-title',
  'missing-meta-description',
  'missing-h1',
  'slow-response',
  'redirected-link',
  'title-length',
  'duplicate-meta-description',
  'multiple-h1',
  'missing-canonical',
  'noindex',
  'large-page',
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type AuditRuleId = (typeof AUDIT_RULE_IDS)[number];

export interface AuditRuleDefinition {
  title: string;
  severity: IssueSeverity;
  description: string;
}

/** The rule catalog. The worker implements these ids; API and web read titles and severities. */
export const AUDIT_RULES: Readonly<Record<AuditRuleId, AuditRuleDefinition>> = {
  'broken-internal-link': {
    title: 'Broken internal link',
    severity: 'critical',
    description:
      'The page links to a page on this site that returned an error or could not be fetched.',
  },
  'server-error': {
    title: 'Server error',
    severity: 'critical',
    description: 'The page returned a 5xx status or could not be fetched at all.',
  },
  'client-error': {
    title: 'Page not found or forbidden',
    severity: 'warning',
    description: 'The page returned a 4xx status.',
  },
  'missing-title': {
    title: 'Missing title',
    severity: 'warning',
    description: 'The page has no <title>, so search results have nothing to show as its headline.',
  },
  'duplicate-title': {
    title: 'Duplicate title',
    severity: 'warning',
    description:
      'Several pages share this title, which makes them hard to tell apart in search results.',
  },
  'missing-meta-description': {
    title: 'Missing meta description',
    severity: 'warning',
    description: 'The page has no meta description, so search engines pick a snippet themselves.',
  },
  'missing-h1': {
    title: 'Missing H1',
    severity: 'warning',
    description: 'The page has no <h1> heading describing its main topic.',
  },
  'slow-response': {
    title: 'Slow response',
    severity: 'warning',
    description: 'The server took more than 2 seconds to respond.',
  },
  'redirected-link': {
    title: 'Link to a redirect',
    severity: 'notice',
    description:
      'The page links to a URL that redirects; linking to the final URL saves a round trip.',
  },
  'title-length': {
    title: 'Title too short or too long',
    severity: 'notice',
    description: 'Titles under 10 or over 60 characters tend to be uninformative or truncated.',
  },
  'duplicate-meta-description': {
    title: 'Duplicate meta description',
    severity: 'notice',
    description: 'Several pages share this meta description.',
  },
  'multiple-h1': {
    title: 'Multiple H1 headings',
    severity: 'notice',
    description: 'The page has more than one <h1>, which blurs its main topic.',
  },
  'missing-canonical': {
    title: 'Missing canonical URL',
    severity: 'notice',
    description: 'The page does not declare a canonical URL, so duplicate URLs may compete.',
  },
  noindex: {
    title: 'Excluded from search (noindex)',
    severity: 'notice',
    description: 'The page asks search engines not to index it. Check this is intentional.',
  },
  'large-page': {
    title: 'Large page',
    severity: 'notice',
    description: 'The page is larger than 1 MB.',
  },
};

export const ISSUE_LIST_DEFAULT_LIMIT = 50;
export const ISSUE_LIST_MAX_LIMIT = 200;

export const auditRuleSchema = z.object({
  id: z.enum(AUDIT_RULE_IDS),
  title: z.string(),
  severity: z.enum(ISSUE_SEVERITIES),
  description: z.string(),
});

export const ruleCountSchema = z.object({
  ruleId: z.enum(AUDIT_RULE_IDS),
  severity: z.enum(ISSUE_SEVERITIES),
  count: z.number().int(),
});

/** An audit of one scan, with per-rule counts for grouping. Dates are ISO strings. */
export const auditSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  organizationId: z.string(),
  status: z.enum(AUDIT_STATUSES),
  criticalCount: z.number().int(),
  warningCount: z.number().int(),
  noticeCount: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ruleCounts: z.array(ruleCountSchema),
});

export const issueSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  pageId: z.string(),
  ruleId: z.enum(AUDIT_RULE_IDS),
  severity: z.enum(ISSUE_SEVERITIES),
  message: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  page: z.object({ url: z.string(), path: z.string() }),
});

export const issueListQuerySchema = z.object({
  severity: z.enum(ISSUE_SEVERITIES).optional(),
  ruleId: z.enum(AUDIT_RULE_IDS).optional(),
  limit: z.coerce.number().int().min(1).max(ISSUE_LIST_MAX_LIMIT).default(ISSUE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export const issueListSchema = z.object({
  items: z.array(issueSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type AuditRule = z.infer<typeof auditRuleSchema>;
export type RuleCount = z.infer<typeof ruleCountSchema>;
export type Audit = z.infer<typeof auditSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type IssueListQuery = z.infer<typeof issueListQuerySchema>;
export type IssueList = z.infer<typeof issueListSchema>;
