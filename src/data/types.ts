/**
 * Shared data model for merged multi-source contribution data.
 * Produced by the fetch pipeline (src/fetch), consumed by the React app (src/components).
 */

/** A single day in a contribution calendar. */
export interface Day {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Summed contribution count across all sources for this day. */
  count: number;
  /**
   * Whether at least one enabled source actually covers this date.
   * `false` => no source has data here (e.g. pre-migration / lost history),
   * which is rendered distinctly from a real zero-count day.
   */
  known: boolean;
}

/** A calendar week: always 7 entries, Sunday → Saturday (GitHub layout). */
export interface Week {
  days: Day[];
}

/** One year's worth of contribution calendar. */
export interface YearCalendar {
  year: number;
  /** Total contributions across known days in the year. */
  total: number;
  weeks: Week[];
}

/** Metadata about a source that contributed to the merged data. */
export interface SourceMeta {
  id: string;
  label: string;
  type: 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'forgejo' | 'gitea' | 'local' | 'json';
  /** Inclusive ISO date range the source provided data for. */
  coverage: { from: string; to: string };
}

/** Top-level merged document written to `public/data/contributions.json`. */
export interface MergedData {
  /** ISO timestamp of when the data was fetched. */
  generatedAt: string;
  sources: SourceMeta[];
  /** Calendars, ascending by year. */
  years: YearCalendar[];
}
