'use client';

import type { AuditRuleId } from '@wintel/types';
import { Button } from '@wintel/ui';

import { useBilling } from '@/lib/use-billing';
import { isActiveExplanation, useExplanation, useRequestExplanation } from '@/lib/use-explanations';

const ERROR_TEXT: Record<string, string> = {
  AI_UNAVAILABLE: 'AI explanations are not enabled for this workspace.',
  PLAN_AI_LIMIT: 'Your organization has used every AI explanation in its plan this month.',
  PLAN_AI_LOCKED: 'AI explanations are not part of your plan.',
  NO_ISSUES_FOR_RULE: 'This rule has no issues to explain.',
  AUDIT_NOT_COMPLETED: 'Wait for the audit to finish before asking for an explanation.',
};

function describeError(error: unknown): string {
  const { status, code } = (error ?? {}) as { status?: number; code?: string | null };
  if (code && ERROR_TEXT[code]) {
    return ERROR_TEXT[code];
  }
  return status === 403
    ? 'Only admins can regenerate explanations.'
    : 'Could not request an explanation.';
}

/** Claude's explanation of one rule in this audit: request, progress, result, regenerate. */
export function AiExplanation({ scanId, ruleId }: { scanId: string; ruleId: AuditRuleId }) {
  const { data: explanation, isPending, isError } = useExplanation(scanId, ruleId);
  const requestIt = useRequestExplanation(scanId, ruleId);
  const billing = useBilling();
  const aiLimit = billing.data?.limits.aiExplanationsPerMonth ?? null;
  const aiUsed = billing.data?.usage.aiExplanationsThisMonth ?? 0;

  if (isPending) {
    return null;
  }
  if (isError) {
    return <p className="text-xs text-destructive">Could not load the explanation.</p>;
  }

  const active = isActiveExplanation(explanation);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
      {requestIt.error ? (
        <p role="alert" className="text-xs text-destructive">
          {describeError(requestIt.error)}
        </p>
      ) : null}

      {explanation === null ? (
        aiLimit === 0 ? (
          <p className="text-xs text-muted-foreground">
            AI explanations are not part of your plan.{' '}
            <a className="underline" href="/dashboard/billing">
              See plans
            </a>
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={requestIt.isPending}
              onClick={() => requestIt.mutate({ regenerate: false })}
            >
              Explain with AI
            </Button>
            {aiLimit === null ? null : (
              <span className="text-xs text-muted-foreground">
                {Math.max(aiLimit - aiUsed, 0)} left this month
              </span>
            )}
          </div>
        )
      ) : active ? (
        <p className="text-xs text-muted-foreground">Generating explanation…</p>
      ) : explanation.status === 'failed' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-destructive">
            {explanation.error ?? 'The explanation failed.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={requestIt.isPending}
            onClick={() => requestIt.mutate({ regenerate: true })}
          >
            Try again
          </Button>
        </div>
      ) : explanation.content ? (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-sm">{explanation.content.summary}</p>
          <p className="text-muted-foreground">{explanation.content.whyItMatters}</p>
          <ul className="flex flex-col gap-1">
            {explanation.content.fixes.map((fix) => (
              <li key={fix.path} className="flex flex-col">
                <span className="font-medium">{fix.path}</span>
                <span>{fix.action}</span>
              </li>
            ))}
          </ul>
          {explanation.content.generalAdvice.length > 0 ? (
            <ul className="list-disc pl-4 text-muted-foreground">
              {explanation.content.generalAdvice.map((advice) => (
                <li key={advice}>{advice}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">AI-generated — review before applying.</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={requestIt.isPending}
              onClick={() => requestIt.mutate({ regenerate: true })}
            >
              Regenerate
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
