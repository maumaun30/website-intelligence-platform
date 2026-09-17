import type { AuditRuleId } from '@wintel/types';

import { TITLE_MAX_LENGTH, TITLE_MIN_LENGTH } from '../audit.constants';
import {
  type AuditContext,
  type AuditRuleImplementation,
  type IssueDraft,
  htmlPages,
} from '../audit-context';
import type { PageFacts } from '../page-facts';

function pageRule(
  id: AuditRuleId,
  check: (facts: PageFacts) => { message: string; evidence: Record<string, unknown> } | null,
): AuditRuleImplementation {
  return {
    id,
    evaluate: (ctx) =>
      htmlPages(ctx).flatMap(({ page, facts }) => {
        const finding = check(facts);
        return finding ? [{ pageId: page.id, ruleId: id, ...finding }] : [];
      }),
  };
}

function duplicateRule(
  id: AuditRuleId,
  field: 'title' | 'metaDescription',
  evidenceKey: 'title' | 'description',
  label: string,
): AuditRuleImplementation {
  return {
    id,
    evaluate: (ctx: AuditContext) => {
      const pages = htmlPages(ctx);
      const counts = new Map<string, number>();
      for (const { facts } of pages) {
        const value = facts[field];
        if (value !== null) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      return pages.flatMap(({ page, facts }): IssueDraft[] => {
        const value = facts[field];
        const duplicateCount = value === null ? 0 : (counts.get(value) ?? 0);
        return duplicateCount > 1
          ? [
              {
                pageId: page.id,
                ruleId: id,
                message: `${duplicateCount} pages share the ${label} "${value}"`,
                evidence: { [evidenceKey]: value, duplicateCount },
              },
            ]
          : [];
      });
    },
  };
}

export const missingTitleRule = pageRule('missing-title', (facts) =>
  facts.title === null ? { message: 'The page has no title', evidence: {} } : null,
);

export const titleLengthRule = pageRule('title-length', (facts) => {
  if (facts.title === null) {
    return null;
  }
  const length = facts.title.length;
  if (length >= TITLE_MIN_LENGTH && length <= TITLE_MAX_LENGTH) {
    return null;
  }
  return {
    message: `The title is ${length} characters (aim for ${TITLE_MIN_LENGTH}–${TITLE_MAX_LENGTH})`,
    evidence: { title: facts.title, length },
  };
});

export const duplicateTitleRule = duplicateRule('duplicate-title', 'title', 'title', 'title');

export const missingMetaDescriptionRule = pageRule('missing-meta-description', (facts) =>
  facts.metaDescription === null
    ? { message: 'The page has no meta description', evidence: {} }
    : null,
);

export const duplicateMetaDescriptionRule = duplicateRule(
  'duplicate-meta-description',
  'metaDescription',
  'description',
  'meta description',
);

export const missingH1Rule = pageRule('missing-h1', (facts) =>
  facts.h1Count === 0 ? { message: 'The page has no H1 heading', evidence: {} } : null,
);

export const multipleH1Rule = pageRule('multiple-h1', (facts) =>
  facts.h1Count > 1
    ? { message: `The page has ${facts.h1Count} H1 headings`, evidence: { count: facts.h1Count } }
    : null,
);

export const missingCanonicalRule = pageRule('missing-canonical', (facts) =>
  facts.hasCanonical ? null : { message: 'The page declares no canonical URL', evidence: {} },
);

export const noindexRule = pageRule('noindex', (facts) =>
  facts.robotsContent !== null && facts.robotsContent.toLowerCase().includes('noindex')
    ? {
        message: 'The page asks search engines not to index it',
        evidence: { content: facts.robotsContent },
      }
    : null,
);
