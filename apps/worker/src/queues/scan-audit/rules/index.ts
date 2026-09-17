import type { AuditRuleImplementation } from '../audit-context';
import {
  duplicateMetaDescriptionRule,
  duplicateTitleRule,
  missingCanonicalRule,
  missingH1Rule,
  missingMetaDescriptionRule,
  missingTitleRule,
  multipleH1Rule,
  noindexRule,
  titleLengthRule,
} from './content-rules';
import { brokenInternalLinkRule, redirectedLinkRule } from './link-rules';
import { clientErrorRule, largePageRule, serverErrorRule, slowResponseRule } from './status-rules';

/** Every rule the engine runs. The registry test keeps this in lockstep with AUDIT_RULE_IDS. */
export const AUDIT_RULE_IMPLEMENTATIONS: readonly AuditRuleImplementation[] = [
  brokenInternalLinkRule,
  serverErrorRule,
  clientErrorRule,
  missingTitleRule,
  duplicateTitleRule,
  missingMetaDescriptionRule,
  missingH1Rule,
  slowResponseRule,
  redirectedLinkRule,
  titleLengthRule,
  duplicateMetaDescriptionRule,
  multipleH1Rule,
  missingCanonicalRule,
  noindexRule,
  largePageRule,
];
