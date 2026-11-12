/**
 * Browser-side setup: sources, lost ranges and fetched data live in this browser only
 * (localStorage). Tokens are kept in memory for the session unless the user ticks
 * "Remember on this device"; nothing is ever sent to contribs.sh.
 */
import type { LostConfig } from '../data/lost';
import { EMPTY_LOST_CONFIG } from '../data/lost';
import type { MergedData } from '../data/types';
import type { SourceResult, SourceType } from '../fetch/adapters/types';

export type BrowserSourceType = Extract<SourceType, 'github' | 'gitlab' | 'bitbucket' | 'forgejo' | 'json'>;

export interface BrowserSource {
  id: string;
  label: string;
  type: BrowserSourceType;
  host: string;
  username: string;
  emails?: string[];
  from?: string;
  to?: string;
  /** Only present when the user chose "Remember on this device". */
  token?: string;
  rememberToken?: boolean;
  enabled?: boolean;
}

export interface Workspace {
  version: 1;
  sources: BrowserSource[];
  lost: LostConfig;
}

export interface Fetched {
  merged: MergedData;
  details: Record<string, SourceResult>;
}

const WORKSPACE_KEY = 'contribs-sh:workspace';
const DATA_KEY = 'contribs-sh:data';

/** Session-only tokens, by source id. Cleared on reload. */
const sessionTokens = new Map<string, string>();

export function emptyWorkspace(): Workspace {
  return { version: 1, sources: [], lost: { ...EMPTY_LOST_CONFIG, label: 'History on another platform' } };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadWorkspace(): Workspace | null {
  const ws = read<Workspace>(WORKSPACE_KEY);
  return ws && ws.version === 1 && Array.isArray(ws.sources) ? ws : null;
}

export function saveWorkspace(ws: Workspace): void {
  const stored: Workspace = {
    ...ws,
    sources: ws.sources.map((s) => {
      if (!s.rememberToken) {
        if (s.token) sessionTokens.set(s.id, s.token);
        const { token: _drop, ...rest } = s;
        return rest;
      }
      return s;
    }),
  };
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(stored));
}

export function tokenFor(source: BrowserSource): string {
  return source.token ?? sessionTokens.get(source.id) ?? '';
}

export function setSessionToken(id: string, token: string): void {
  if (token) sessionTokens.set(id, token);
  else sessionTokens.delete(id);
}

export function loadFetched(): Fetched | null {
  return read<Fetched>(DATA_KEY);
}

export function saveFetched(f: Fetched): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(f));
}

export function clearEverything(): void {
  localStorage.removeItem(WORKSPACE_KEY);
  localStorage.removeItem(DATA_KEY);
  sessionTokens.clear();
}

/** The setup file users can download and re-import. Tokens are never included. */
export function exportWorkspace(ws: Workspace): string {
  return JSON.stringify(
    { ...ws, sources: ws.sources.map(({ token: _t, rememberToken: _r, ...rest }) => rest) },
    null,
    2,
  );
}

export function parseWorkspace(text: string): Workspace {
  const raw = JSON.parse(text) as Partial<Workspace> & { sources?: unknown; ranges?: unknown };
  // Also accept a CLI `sources.json` ({ sources }) or `lost-ranges.json` ({ enabled, label, ranges }).
  const ws = emptyWorkspace();
  if (Array.isArray(raw.sources)) {
    ws.sources = (raw.sources as BrowserSource[])
      .filter((s) => s && typeof s.id === 'string' && ['github', 'gitlab', 'bitbucket', 'forgejo', 'gitea', 'json'].includes(s.type))
      .map((s) => ({
        id: s.id,
        label: s.label ?? s.id,
        type: (s.type as string) === 'gitea' ? 'forgejo' : s.type,
        host: s.host ?? DEFAULT_HOSTS[s.type] ?? '',
        username: s.username ?? '',
        emails: s.emails,
        from: s.from,
        to: s.to,
        enabled: s.enabled,
      }));
  }
  if (raw.lost && Array.isArray(raw.lost.ranges)) ws.lost = raw.lost;
  else if (Array.isArray(raw.ranges)) ws.lost = raw as unknown as LostConfig;
  return ws;
}

export const DEFAULT_HOSTS: Partial<Record<string, string>> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  forgejo: 'codeberg.org',
};

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'source';
}
