import { CRAWLER_USER_AGENT, REQUEST_TIMEOUT_MS, ROBOTS_USER_AGENT_TOKEN } from './crawl.constants';

export interface RobotsRules {
  isAllowed(pathWithQuery: string): boolean;
  crawlDelayMs: number;
}

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true, crawlDelayMs: 0 };

const MAX_ROBOTS_BYTES = 500_000;

interface Rule {
  allow: boolean;
  length: number;
  pattern: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelayMs: number;
}

function toPattern(path: string): RegExp {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelayMs: 0 };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) {
      continue;
    }
    if ((field === 'allow' || field === 'disallow') && value.length > 0) {
      current.rules.push({
        allow: field === 'allow',
        length: value.length,
        pattern: toPattern(value),
      });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        current.crawlDelayMs = Math.round(seconds * 1000);
      }
    }
  }
  return groups;
}

/**
 * The subset of robots.txt real sites use: user-agent groups, Allow/Disallow with `*` and `$`, and
 * Crawl-delay. The most specific group naming our token wins over `*`; within a group the longest
 * matching rule wins, and Allow wins a tie.
 */
export function parseRobotsTxt(text: string, userAgentToken: string): RobotsRules {
  const groups = parseGroups(text);
  const token = userAgentToken.toLowerCase();

  let best: Group | undefined;
  let bestLength = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      const length = agent === '*' ? 0 : token.includes(agent) ? agent.length : -1;
      if (length > bestLength) {
        best = group;
        bestLength = length;
      }
    }
  }

  if (!best) {
    return ALLOW_ALL;
  }
  const { rules, crawlDelayMs } = best;

  return {
    crawlDelayMs,
    isAllowed(pathWithQuery: string): boolean {
      let winner: Rule | undefined;
      for (const rule of rules) {
        if (!rule.pattern.test(pathWithQuery)) {
          continue;
        }
        if (
          !winner ||
          rule.length > winner.length ||
          (rule.length === winner.length && rule.allow && !winner.allow)
        ) {
          winner = rule;
        }
      }
      return winner ? winner.allow : true;
    },
  };
}

/** Fetches `/robots.txt`; anything but a readable 2xx means "no restrictions". */
export async function loadRobotsTxt(
  origin: string,
  fetchFn: typeof fetch = fetch,
): Promise<RobotsRules> {
  try {
    const response = await fetchFn(`${origin}/robots.txt`, {
      headers: { 'user-agent': CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return ALLOW_ALL;
    }
    const text = (await response.text()).slice(0, MAX_ROBOTS_BYTES);
    return parseRobotsTxt(text, ROBOTS_USER_AGENT_TOKEN);
  } catch {
    return ALLOW_ALL;
  }
}
