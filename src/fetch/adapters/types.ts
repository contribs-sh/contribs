/** Normalized output every source adapter must produce. */
export interface SourceResult {
  id: string;
  label: string;
  type: 'github' | 'forgejo';
  /** Map of ISO date (`YYYY-MM-DD`) → contribution count for that day. */
  days: Record<string, number>;
  /** Inclusive ISO date range this source has data for. */
  coverage: { from: string; to: string };
}

/** Config for a single source, after token resolution. */
export interface ResolvedSource {
  id: string;
  label: string;
  type: 'github' | 'forgejo';
  host: string;
  username: string;
  /** Auth token (github.com pulled via `gh auth token`, others from env). */
  token: string;
}

/** A source adapter fetches and normalizes one account's contributions. */
export type Adapter = (source: ResolvedSource) => Promise<SourceResult>;
