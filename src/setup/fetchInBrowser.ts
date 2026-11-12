import { githubAdapter } from '../fetch/adapters/github';
import { gitlabAdapter } from '../fetch/adapters/gitlab';
import { bitbucketAdapter } from '../fetch/adapters/bitbucket';
import { forgejoAdapter } from '../fetch/adapters/forgejo';
import type { Adapter, ResolvedSource, SourceResult } from '../fetch/adapters/types';
import { merge } from '../fetch/merge';
import { applyWindow } from '../fetch/window';
import { tokenFor, type BrowserSource, type Fetched } from './store';

const adapters: Partial<Record<BrowserSource['type'], Adapter>> = {
  github: githubAdapter,
  gitlab: gitlabAdapter,
  bitbucket: bitbucketAdapter,
  forgejo: forgejoAdapter,
};

function resolve(source: BrowserSource): ResolvedSource {
  return {
    id: source.id,
    label: source.label,
    type: source.type,
    host: source.host,
    username: source.username,
    token: tokenFor(source),
    emails: source.emails,
    from: source.from,
    to: source.to,
  };
}

/** Fetch one source from the browser, straight to the forge's API. */
export async function fetchSource(source: BrowserSource): Promise<SourceResult> {
  const adapter = adapters[source.type];
  if (!adapter) throw new Error(`${source.type} sources are imported from a file, not fetched.`);
  if (source.type !== 'forgejo' && !tokenFor(source)) throw new Error('Add a token for this source.');
  try {
    return applyWindow(await adapter(resolve(source)), source.from, source.to);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
      throw new Error(`Couldn't reach ${source.host} from the browser. Self-hosted instances may block cross-site requests; use the CLI for those.`);
    }
    if (/\b401\b|Bad credentials|Unauthorized/i.test(message)) throw new Error('The token was rejected. Check it and its scopes.');
    throw err instanceof Error ? err : new Error(message);
  }
}

export interface FetchReport {
  fetched: Fetched;
  errors: Record<string, string>;
}

/**
 * Re-fetch every enabled source. Sources that fail (or have no session token) keep their
 * previous data so one bad token never wipes the dashboard.
 */
export async function fetchAll(
  sources: BrowserSource[],
  previous: Fetched | null,
  imported: Record<string, SourceResult>,
  onProgress?: (id: string, state: 'start' | 'done' | 'error') => void,
): Promise<FetchReport> {
  const details: Record<string, SourceResult> = {};
  const errors: Record<string, string> = {};
  for (const source of sources) {
    if (source.enabled === false) continue;
    if (source.type === 'json') {
      const data = imported[source.id] ?? previous?.details[source.id];
      if (data) details[source.id] = applyWindow({ ...data, label: source.label }, source.from, source.to);
      continue;
    }
    onProgress?.(source.id, 'start');
    try {
      details[source.id] = await fetchSource(source);
      onProgress?.(source.id, 'done');
    } catch (err) {
      errors[source.id] = err instanceof Error ? err.message : String(err);
      const old = previous?.details[source.id];
      if (old) details[source.id] = { ...old, label: source.label };
      onProgress?.(source.id, 'error');
    }
  }
  const results = Object.values(details);
  const merged = merge(results, new Date().toISOString());
  return { fetched: { merged, details }, errors };
}

/** Parse an uploaded `{ "YYYY-MM-DD": count }` file, or a CLI per-source file (`{ days, ... }`). */
export function parseImport(text: string, id: string, label: string): SourceResult {
  const raw = JSON.parse(text) as Record<string, unknown> & { days?: Record<string, unknown> };
  const map = raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object' ? raw.days : raw;
  const days: Record<string, number> = {};
  for (const [d, n] of Object.entries(map ?? {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && typeof n === 'number' && n > 0) days[d] = Math.round(n);
  }
  const dates = Object.keys(days).sort();
  if (dates.length === 0) throw new Error('No "YYYY-MM-DD": count entries found in that file.');
  return { id, label, type: 'json', days, coverage: { from: dates[0], to: dates[dates.length - 1] } };
}
