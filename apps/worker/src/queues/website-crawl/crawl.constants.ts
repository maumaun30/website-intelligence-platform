/** Fixed operational limits for a crawl. Per-website limits come from the scan config instead. */
export const CRAWL_CONCURRENCY = 5;
export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 5;
export const MAX_RESPONSE_BYTES = 2_000_000;
export const MAX_CONTENT_BYTES = 1_000_000;
export const WRITE_BATCH_SIZE = 50;
export const MAX_CRAWL_DELAY_MS = 5_000;
export const ROBOTS_USER_AGENT_TOKEN = 'wintelbot';
export const CRAWLER_USER_AGENT = 'WintelBot/1.0 (+https://wintel.example/bot)';
