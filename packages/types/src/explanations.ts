import { z } from 'zod';

import { AUDIT_RULE_IDS } from './audit';

export const EXPLANATION_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export const ACTIVE_EXPLANATION_STATUSES = ['queued', 'running'] as const;

export const AI_DAILY_LIMIT = 50;
export const EXPLANATION_PAGE_LIMIT = 10;
export const EXPLANATION_MAX_FIXES = 10;
export const EXPLANATION_MAX_ADVICE = 5;

export const EXPLAIN_ISSUE_QUEUE = 'explain-issue';

/** What the model returns, after validation. */
export const explanationContentSchema = z.object({
  summary: z.string(),
  whyItMatters: z.string(),
  fixes: z.array(z.object({ path: z.string(), action: z.string() })),
  generalAdvice: z.array(z.string()),
});

export const explanationSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  ruleId: z.enum(AUDIT_RULE_IDS),
  status: z.enum(EXPLANATION_STATUSES),
  content: explanationContentSchema.nullable(),
  model: z.string().nullable(),
  error: z.string().nullable(),
  requestedAt: z.string(),
  updatedAt: z.string(),
});

export const requestExplanationInputSchema = z.object({
  ruleId: z.enum(AUDIT_RULE_IDS),
  regenerate: z.boolean().default(false),
});

export const explainIssueJobSchema = z.object({ explanationId: z.string() });

export type ExplanationStatus = (typeof EXPLANATION_STATUSES)[number];
export type ExplanationContent = z.infer<typeof explanationContentSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
export type RequestExplanationInput = z.infer<typeof requestExplanationInputSchema>;
export type ExplainIssueJob = z.infer<typeof explainIssueJobSchema>;
