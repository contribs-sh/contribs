import type { MergedData, SourceMeta } from '../data/types';
import type { SourceResult } from './adapters/types';
import { buildYearCalendars } from './calendar';
import { startYear } from '../config';

/**
 * Merge normalized source results into a single contribution document.
 * Per-day counts are summed across sources; coverage windows are unioned so the
 * calendar can mark days no source covered as unknown.
 */
export function merge(results: SourceResult[], generatedAt: string): MergedData {
  const fetchedThrough = generatedAt.slice(0, 10);
  results = results.map((result) => ({
    ...result,
    days: Object.fromEntries(Object.entries(result.days).filter(([date]) => date <= fetchedThrough)),
    coverage: { ...result.coverage, to: result.coverage.to > fetchedThrough ? fetchedThrough : result.coverage.to },
  }));
  const counts: Record<string, number> = {};
  for (const result of results) {
    for (const [date, count] of Object.entries(result.days)) {
      counts[date] = (counts[date] ?? 0) + count;
    }
  }

  const years = buildYearCalendars({
    counts,
    coverage: results.map((r) => r.coverage),
    startYear,
  });

  const sources: SourceMeta[] = results.map((r) => ({
    id: r.id,
    label: r.label,
    type: r.type,
    coverage: r.coverage,
  }));

  return { generatedAt, sources, years };
}
