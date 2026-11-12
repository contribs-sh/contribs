import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Adapter, ResolvedSource } from './types';

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', '.cache', 'Library']);

function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path;
}

/** Find git repositories (working trees or bare) under `root`, up to `depth` levels deep. */
export function findRepos(root: string, depth: number): string[] {
  const repos: string[] = [];
  const walk = (dir: string, level: number) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes('.git') || (entries.includes('HEAD') && entries.includes('objects') && entries.includes('refs'))) {
      repos.push(dir);
      return;
    }
    if (level >= depth) return;
    for (const name of entries) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
      const child = join(dir, name);
      try {
        if (statSync(child).isDirectory()) walk(child, level + 1);
      } catch {
        /* unreadable entry */
      }
    }
  };
  walk(resolve(expandHome(root)), 0);
  return repos;
}

/**
 * Local git adapter: recovers history that never reached (or no longer exists on) a
 * hosted forge by reading commits you authored in repos on disk. Commits are
 * de-duplicated by hash across repos, so forks and clones count once.
 *
 * Commits that were also pushed to GitHub are already in your GitHub graph — use
 * `from`/`to` to limit this source to the period the hosted data is missing.
 */
export const localAdapter: Adapter = async (source: ResolvedSource) => {
  const paths = source.paths ?? [];
  const emails = (source.emails ?? []).map((e) => e.toLowerCase());
  if (paths.length === 0 || emails.length === 0) {
    throw new Error(`Local source ${source.id} needs "paths" and "emails"`);
  }

  const repos = [...new Set(paths.flatMap((p) => findRepos(p, source.depth ?? 4)))];
  const seen = new Set<string>();
  const days: Record<string, number> = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const repo of repos) {
    let log: string;
    try {
      log = execFileSync('git', ['-C', repo, 'log', '--all', '--no-merges', '--format=%H %ae %as'], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue; // empty repo or not readable
    }
    for (const line of log.split('\n')) {
      const [hash, email, date] = line.split(' ');
      if (!hash || !date || seen.has(hash)) continue;
      if (!emails.includes(email?.toLowerCase())) continue;
      if (source.from && date < source.from) continue;
      if (source.to && date > source.to) continue;
      if (date > today) continue;
      seen.add(hash);
      days[date] = (days[date] ?? 0) + 1;
    }
  }

  const dates = Object.keys(days).sort();
  return {
    id: source.id,
    label: source.label,
    type: 'local',
    days,
    coverage: {
      from: source.from ?? dates[0] ?? today,
      to: source.to ?? dates[dates.length - 1] ?? today,
    },
  };
};
