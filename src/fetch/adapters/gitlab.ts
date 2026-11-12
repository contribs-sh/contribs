import type { Adapter } from './types';
import { bucketByDay, coverageOf, getJson } from './http';

interface GitLabUser {
  id: number;
  username: string;
  created_at?: string;
}
interface GitLabEvent {
  created_at: string;
  action_name: string;
  push_data?: { commit_count?: number } | null;
}

/**
 * GitLab adapter: gitlab.com or any self-managed instance.
 * Walks the authenticated user's events (`/api/v4/events`) and counts each the way
 * GitLab's own calendar does: one per event, except pushes, which count their commits.
 * gitlab.com only returns about the last three years of events; older history needs
 * a `local` source (`contribs.sh scan`).
 * Token: personal access token with `read_api` (or `read_user` + `read_repository`).
 */
export const gitlabAdapter: Adapter = async (source) => {
  const base = `https://${source.host}/api/v4`;
  const headers = { 'PRIVATE-TOKEN': source.token };
  const user = await getJson<GitLabUser>(`${base}/user`, headers, 'GitLab');
  if (source.username && user.username.toLowerCase() !== source.username.toLowerCase()) {
    throw new Error(`GitLab token belongs to "${user.username}", not "${source.username}"`);
  }

  const stamps: string[] = [];
  for (let page = 1; page <= 500; page++) {
    const url = `${base}/events?per_page=100&page=${page}&sort=desc${source.from ? `&after=${dayBefore(source.from)}` : ''}`;
    const events = await getJson<GitLabEvent[]>(url, headers, 'GitLab');
    for (const event of events) {
      const date = event.created_at.slice(0, 10);
      if (source.to && date > source.to) continue;
      const n = event.action_name.startsWith('pushed') ? Math.max(1, event.push_data?.commit_count ?? 1) : 1;
      for (let i = 0; i < n; i++) stamps.push(date);
    }
    if (events.length < 100) break;
  }

  const days = bucketByDay(stamps);
  return { id: source.id, label: source.label, type: 'gitlab', days, coverage: coverageOf(days, source.from, source.to) };
};

function dayBefore(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
