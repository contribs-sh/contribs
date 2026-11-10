import raw from '../config.json';

/**
 * Site/display settings. Committed (not personal data) — fork and edit freely.
 * Personal config lives in the gitignored `sources.json` / `lost-ranges.json`.
 */
interface AppConfig {
  /** Site name — shown as the page heading and the browser tab title. */
  title: string;
  /** How many of the most recent years to show before the "show earlier" toggle. */
  recentYears: number;
  /** Earliest year to include, even when sources have no coverage. */
  startYear: number;
}

const config = raw as Partial<AppConfig>;

export const title = config.title ?? 'contribs.sh';
export const recentYears = config.recentYears ?? 10;
export const startYear = config.startYear;
