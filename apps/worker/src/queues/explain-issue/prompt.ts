import type { ExplanationInput } from './explanation-input';

/**
 * Stable across every request so it forms a cacheable prefix. Anything specific to a website or
 * rule goes in the user message instead.
 */
export const EXPLANATION_SYSTEM_PROMPT = `You explain technical SEO audit findings to website owners and developers.

You receive one audit rule, the website's domain, how many issues and pages it affects, and details for up to ten affected pages: the page path, the finding, its evidence, and facts extracted from the page (title, meta description, number of H1 headings, whether a canonical link exists, robots meta content). Facts may be missing when the page's HTML was not stored.

Write for someone who will act on the advice today:
- summary: two or three sentences describing what is wrong on this site specifically, using the counts you were given.
- whyItMatters: a short paragraph on the concrete effect for this site (search visibility, user experience, crawl efficiency). Do not exaggerate impact.
- fixes: one entry per listed page, in the order given, with the exact path and a specific action for that page. Use the page facts and evidence to be specific (for example propose a distinct title when titles collide). Never invent pages that were not listed.
- generalAdvice: up to five short, practical practices that prevent the problem from recurring.

Only use the information provided. If the data is insufficient for a page-specific action, give the most specific action the data supports and say what to check.`;

export function renderExplanationPrompt(input: ExplanationInput): string {
  const header = [
    `Website: ${input.domain}`,
    `Rule: ${input.rule.title} (${input.rule.id}, severity ${input.rule.severity})`,
    `Rule description: ${input.rule.description}`,
    `Scope: ${input.issueCount} issues across ${input.affectedPageCount} pages; ${input.pages.length} pages listed below.`,
  ].join('\n');

  return `${header}\n\nAffected pages:\n${JSON.stringify(input.pages, null, 2)}`;
}
