import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MergedData } from '../data/types';

/**
 * Make a built site safe to publish: replace account labels with "Source 1, 2, …" and remove the
 * per-account files, so a public deploy shows only merged daily counts. Labels like
 * "GitHub Enterprise (work-username)" otherwise go public.
 */
export function anonymizeSite(distDir: string): { sources: number } {
  const merged = resolve(distDir, 'data/contributions.json');
  if (!existsSync(merged)) throw new Error(`No data at ${merged}; build the site first.`);
  const data = JSON.parse(readFileSync(merged, 'utf8')) as MergedData;
  data.sources = data.sources.map((s, i) => ({ ...s, id: `source-${i + 1}`, label: `Source ${i + 1}` }));
  writeFileSync(merged, JSON.stringify(data));
  rmSync(resolve(distDir, 'data/sources'), { recursive: true, force: true });
  return { sources: data.sources.length };
}
