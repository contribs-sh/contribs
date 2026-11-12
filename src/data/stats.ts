import type { YearCalendar } from './types';

export interface Stats {
  /** Real contributions + lost/incomplete days (when included), 1 each. */
  total: number;
  /** Active contribution days + lost/incomplete days (when included). */
  activeDays: number;
  /** Days a source actually covered (denominator excludes lost history). */
  knownDays: number;
  /** Lost/incomplete days folded into total/activeDays (0 when not included). */
  lostDays: number;
  busiest: { date: string; count: number } | null;
  avgPerActiveDay: number;
}

export type Scope = number | 'all';

/**
 * Collect the in-year days of the given scope, keyed by date.
 * Padding cells (days belonging to an adjacent calendar year) are skipped so
 * 'all'-scope stats never double-count the week seams between years.
 */
function collectDays(
  years: YearCalendar[],
  scope: Scope,
): Map<string, { count: number; known: boolean }> {
  const map = new Map<string, { count: number; known: boolean }>();
  for (const year of years) {
    if (scope !== 'all' && year.year !== scope) continue;
    for (const week of year.weeks) {
      for (const day of week.days) {
        if (Number(day.date.slice(0, 4)) !== year.year) continue;
        map.set(day.date, { count: day.count, known: day.known });
      }
    }
  }
  return map;
}

/**
 * `isLost` (optional) marks 0-contribution days that should count as active
 * contribution days — each as 1 toward `total`, `activeDays`, and the average.
 */
export function computeStats(
  years: YearCalendar[],
  scope: Scope,
  isLost?: (date: string) => boolean,
  today = new Date().toISOString().slice(0, 10),
): Stats {
  const byDate = collectDays(years, scope);

  let realTotal = 0;
  let knownDays = 0;
  let lostDays = 0;
  let busiest: { date: string; count: number } | null = null;
  let realActiveDays = 0;

  for (const [date, { count, known }] of byDate) {
    if (date > today) continue;
    if (known) knownDays++;
    if (known && count > 0) {
      realTotal += count;
      realActiveDays++;
      if (!busiest || count > busiest.count) busiest = { date, count };
    } else if (count === 0 && isLost?.(date)) {
      lostDays++;
    }
  }
  const total = realTotal + lostDays;
  const activeDays = realActiveDays + lostDays;

  return {
    total,
    activeDays,
    knownDays,
    lostDays,
    busiest,
    avgPerActiveDay: activeDays ? total / activeDays : 0,
  };
}
