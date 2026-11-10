import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ResolvedSource } from './adapters/types';

const ROOT = resolve(import.meta.dirname, '../..');

interface SourceConfig {
  id: string;
  label: string;
  type: 'github' | 'forgejo';
  host: string;
  username: string;
  /** Env var holding the token. Omit for github.com accounts read via the gh CLI. */
  tokenEnv?: string;
  enabled?: boolean;
}

/**
 * Load enabled sources from `sources.json` and resolve a token for each.
 * Sources whose token cannot be resolved are skipped with a warning so the
 * pipeline still runs with whatever credentials are available.
 */
export function loadSources(): ResolvedSource[] {
  loadDotEnv();

  const raw = readFileSync(resolve(ROOT, 'sources.json'), 'utf8');
  const { sources } = JSON.parse(raw) as { sources: SourceConfig[] };

  const resolved: ResolvedSource[] = [];
  for (const cfg of sources) {
    if (cfg.enabled === false) continue;

    const token = resolveToken(cfg);
    if (!token) {
      console.warn(`⚠︎  Skipping "${cfg.id}" — no token (${tokenHint(cfg)}).`);
      continue;
    }

    resolved.push({
      id: cfg.id,
      label: cfg.label,
      type: cfg.type,
      host: cfg.host,
      username: cfg.username,
      token,
    });
  }
  return resolved;
}

function resolveToken(cfg: SourceConfig): string | null {
  if (cfg.tokenEnv) {
    return process.env[cfg.tokenEnv]?.trim() || null;
  }
  // No explicit env var: a github.com account managed by the gh CLI.
  if (cfg.type === 'github') {
    return ghAuthToken(cfg.host, cfg.username);
  }
  return null;
}

function ghAuthToken(host: string, username: string): string | null {
  try {
    return execFileSync('gh', ['auth', 'token', '--hostname', host, '--user', username], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function tokenHint(cfg: SourceConfig): string {
  return cfg.tokenEnv
    ? `set ${cfg.tokenEnv} in .env`
    : `run \`gh auth login\` for ${cfg.username} on ${cfg.host}`;
}

/** Minimal .env loader (KEY=VALUE per line) so we avoid a dotenv dependency. */
function loadDotEnv(): void {
  let text: string;
  try {
    text = readFileSync(resolve(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
