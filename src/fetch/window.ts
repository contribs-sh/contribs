import type { SourceResult } from './adapters/types';

/** Apply a source's optional `from`/`to` window, e.g. to skip years mirrored on another forge. */
export function applyWindow(result: SourceResult, from?: string, to?: string): SourceResult {
  if (!from && !to) return result;
  const days = Object.fromEntries(
    Object.entries(result.days).filter(([d]) => (!from || d >= from) && (!to || d <= to)),
  );
  const cFrom = from && from > result.coverage.from ? from : result.coverage.from;
  const cTo = to && to < result.coverage.to ? to : result.coverage.to;
  return { ...result, days, coverage: { from: cFrom, to: cTo < cFrom ? cFrom : cTo } };
}
