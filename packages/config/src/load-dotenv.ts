import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as readDotenvFile } from 'dotenv';

/**
 * Loads `.env` files into `process.env` without overriding variables that are already set,
 * so a real deployment environment always wins over a stray file on disk.
 *
 * Defaults walk from the most specific location (the app's own directory) to the least
 * (the monorepo root). Missing files are skipped silently — they are optional by design.
 *
 * @returns the absolute paths that were actually loaded, in load order.
 */
export function loadDotenv(candidatePaths: string[] = ['.env', '../../.env']): string[] {
  const loaded: string[] = [];

  for (const candidate of candidatePaths) {
    const absolutePath = resolve(process.cwd(), candidate);
    if (!existsSync(absolutePath)) {
      continue;
    }

    readDotenvFile({ path: absolutePath });
    loaded.push(absolutePath);
  }

  return loaded;
}
