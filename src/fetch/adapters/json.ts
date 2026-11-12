import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Adapter } from './types';
import { coverageOf, getJson } from './http';

/**
 * Custom source for any forge without a built-in adapter: a URL or local file that returns
 * `{ "YYYY-MM-DD": count, ... }`. Optional token is sent as `Authorization: Bearer`.
 * Config: `url` (https://… or a path relative to the project root).
 */
export const jsonAdapter: Adapter = async (source) => {
  const target = source.url;
  if (!target) throw new Error(`JSON source ${source.id} needs "url"`);
  const raw = /^https?:\/\//.test(target)
    ? await getJson<unknown>(target, source.token ? { Authorization: `Bearer ${source.token}` } : {}, 'JSON source')
    : JSON.parse(readFileSync(resolve(process.cwd(), target), 'utf8'));

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`JSON source ${source.id} must return an object of "YYYY-MM-DD": count`);
  }
  const days: Record<string, number> = {};
  for (const [date, count] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof count !== 'number' || !(count > 0)) continue;
    if (source.from && date < source.from) continue;
    if (source.to && date > source.to) continue;
    days[date] = Math.round(count);
  }
  return { id: source.id, label: source.label, type: 'json', days, coverage: coverageOf(days, source.from, source.to) };
};
