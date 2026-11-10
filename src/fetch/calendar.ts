import type { Day, Week, YearCalendar } from '../data/types';

const MS_DAY = 86_400_000;

/** Parse `YYYY-MM-DD` to a UTC-midnight epoch (ms). */
export function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Format a UTC-midnight epoch (ms) as `YYYY-MM-DD`. */
export function toISO(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Day of week in UTC: 0 = Sunday … 6 = Saturday (GitHub calendar layout). */
function dow(ms: number): number {
  return new Date(ms).getUTCDay();
}

export interface CalendarInput {
  /** Merged ISO-date → count map (already summed across sources). */
  counts: Record<string, number>;
  /** Coverage windows from every contributing source. */
  coverage: Array<{ from: string; to: string }>;
  /** Optional earliest display year; does not extend source coverage. */
  startYear?: number;
}

/**
 * Build one GitHub-style calendar per year spanning the union of source coverage.
 * A day is `known` when at least one source's coverage window includes it; unknown
 * days (lost / pre-migration history) carry count 0 and are styled distinctly.
 */
export function buildYearCalendars({ counts, coverage, startYear: requestedStartYear }: CalendarInput): YearCalendar[] {
  if (coverage.length === 0) return [];

  const ranges = coverage.map((c) => ({ from: parseISO(c.from), to: parseISO(c.to) }));
  const isKnown = (ms: number) => ranges.some((r) => ms >= r.from && ms <= r.to);

  const coverageStartYear = new Date(Math.min(...ranges.map((r) => r.from))).getUTCFullYear();
  const startYear = requestedStartYear !== undefined && Number.isInteger(requestedStartYear) && requestedStartYear >= 1
    ? Math.min(requestedStartYear, coverageStartYear)
    : coverageStartYear;
  const endYear = new Date(Math.max(...ranges.map((r) => r.to))).getUTCFullYear();

  const calendars: YearCalendar[] = [];
  for (let year = startYear; year <= endYear; year++) {
    calendars.push(buildOneYear(year, counts, isKnown));
  }
  return calendars;
}

function buildOneYear(
  year: number,
  counts: Record<string, number>,
  isKnown: (ms: number) => boolean,
): YearCalendar {
  const jan1 = Date.UTC(year, 0, 1);
  const dec31 = Date.UTC(year, 11, 31);
  // Pad to whole weeks: Sunday on/before Jan 1 → Saturday on/after Dec 31.
  const gridStart = jan1 - dow(jan1) * MS_DAY;
  const gridEnd = dec31 + (6 - dow(dec31)) * MS_DAY;

  const weeks: Week[] = [];
  let total = 0;

  for (let cursor = gridStart; cursor <= gridEnd; ) {
    const days: Day[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = toISO(cursor);
      const known = isKnown(cursor);
      const count = known ? counts[iso] ?? 0 : 0;
      days.push({ date: iso, count, known });
      if (known && new Date(cursor).getUTCFullYear() === year) total += count;
      cursor += MS_DAY;
    }
    weeks.push({ days });
  }

  return { year, total, weeks };
}
