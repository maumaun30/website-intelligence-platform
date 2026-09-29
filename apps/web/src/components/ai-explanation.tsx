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

/**
 * The worker stores a refusal code (e.g. `PLAN_AI_LIMIT`) as the explanation's `error` when a
 * quota check fails after the job was queued. Map it through the same friendly text used for a
 * synchronous refusal; anything else is a free-text failure message and is shown as stored.
 */
function describeStoredError(error: string | null): string {
  if (error && ERROR_TEXT[error]) {
    return ERROR_TEXT[error];
  }
  return error ?? 'The explanation failed.';
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
    <div className="flex flex-col gap-3">
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
        <div className="flex flex-col gap-3">
          {/* The skeleton keeps the footprint of the text it will be replaced by. */}
          <div aria-busy="true" className="flex flex-col gap-2">
            <div className="h-3 w-[90%] rounded-sm bg-muted" />
            <div className="h-3 w-[76%] rounded-sm bg-muted" />
            <div className="h-3 w-[84%] rounded-sm bg-muted" />
          </div>
          <p className="text-xs text-muted-foreground">Generating explanation…</p>
        </div>
      ) : explanation.status === 'failed' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-destructive">{describeStoredError(explanation.error)}</p>
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
        <div className="flex flex-col gap-4 text-xs">
          <p className="text-sm leading-relaxed">{explanation.content.summary}</p>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Why it matters</span>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {explanation.content.whyItMatters}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">How to fix</span>
            <ul className="flex flex-col gap-2">
              {explanation.content.fixes.map((fix) => (
                <li key={fix.path} className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs break-all text-muted-foreground">
                    {fix.path}
                  </span>
                  <span className="text-[13px] leading-relaxed">{fix.action}</span>
                </li>
              ))}
            </ul>
          </div>

          {explanation.content.generalAdvice.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] text-muted-foreground">
              {explanation.content.generalAdvice.map((advice) => (
                <li key={advice}>{advice}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
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
