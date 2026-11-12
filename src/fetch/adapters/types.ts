export type SourceType = 'github' | 'forgejo' | 'local';

/** Normalized output every source adapter must produce. */
export interface SourceResult {
  id: string;
  label: string;
  type: SourceType;
  /** Map of ISO date (`YYYY-MM-DD`) → contribution count for that day. */
  days: Record<string, number>;
  /** Inclusive ISO date range this source has data for. */
  coverage: { from: string; to: string };
}

/** Config for a single source, after token resolution. */
export interface ResolvedSource {
  id: string;
  label: string;
  type: SourceType;
  /** Forge host (github/forgejo only). */
  host: string;
  /** Account name (github/forgejo only). */
  username: string;
  /** Auth token (github/forgejo only). */
  token: string;
  /** Directories to scan for git repos (local only). */
  paths?: string[];
  /** Author emails that count as you (local only). */
  emails?: string[];
  /** How many directory levels to descend looking for repos (local only, default 4). */
  depth?: number;
  /** Inclusive ISO window to keep (local only). */
  from?: string;
  to?: string;
}

/** A source adapter fetches and normalizes one account's contributions. */
export type Adapter = (source: ResolvedSource) => Promise<SourceResult>;
