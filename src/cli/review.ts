import type { MergedData } from '../data/types';
import { loadSources } from '../fetch/sources';
import type { ResolvedSource } from '../fetch/adapters/types';
import { getJson } from '../fetch/adapters/http';

/**
 * `contribs.sh review`: a review-season / brag-doc summary for a date window.
 * Counts come from the merged data; the "shipped" list pulls titles of pull/merge requests you
 * authored and merged in the window from GitHub and GitLab sources. Everything runs locally and
 * prints Markdown to stdout. Titles can be confidential: keep the output private unless you've
 * checked it.
 */

export interface ReviewItem {
  source: string;
  repo: string;
  title: string;
  url: string;
  merged: string;
}

export function windowStats(data: MergedData, from: string, to: string) {
  let total = 0;
  let activeDays = 0;
  const byMonth = new Map<string, number>();
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  let busiest: { date: string; count: number } | null = null;
  for (const year of data.years) {
    for (const week of year.weeks) {
      for (const day of week.days) {
        if (Number(day.date.slice(0, 4)) !== year.year || day.date < from || day.date > to || !day.known || day.count <= 0) continue;
        total += day.count;
        activeDays++;
        byMonth.set(day.date.slice(0, 7), (byMonth.get(day.date.slice(0, 7)) ?? 0) + day.count);
        byWeekday[new Date(`${day.date}T00:00:00Z`).getUTCDay()] += day.count;
        if (!busiest || day.count > busiest.count) busiest = { date: day.date, count: day.count };
      }
    }
  }
  return { total, activeDays, byMonth, byWeekday, busiest };
}

async function githubItems(s: ResolvedSource, from: string, to: string): Promise<ReviewItem[]> {
  const endpoint = s.host === 'github.com' ? 'https://api.github.com/graphql' : `https://${s.host}/api/graphql`;
  const items: ReviewItem[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `bearer ${s.token}`, 'Content-Type': 'application/json', 'User-Agent': 'contribs-sh' },
      body: JSON.stringify({
        query: `query($q: String!, $after: String) { search(query: $q, type: ISSUE, first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { ... on PullRequest { title url mergedAt repository { nameWithOwner } } } } }`,
        variables: { q: `is:pr is:merged author:${s.username} merged:${from}..${to}`, after: cursor },
      }),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${s.id}`);
    const json = (await res.json()) as {
      data?: { search: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Array<{ title?: string; url?: string; mergedAt?: string; repository?: { nameWithOwner: string } }> } };
    };
    const search = json.data?.search;
    if (!search) break;
    for (const n of search.nodes) {
      if (n.title && n.url && n.mergedAt && n.repository) {
        items.push({ source: s.label, repo: n.repository.nameWithOwner, title: n.title, url: n.url, merged: n.mergedAt.slice(0, 10) });
      }
    }
    if (!search.pageInfo.hasNextPage) break;
    cursor = search.pageInfo.endCursor;
  }
  return items;
}

async function gitlabItems(s: ResolvedSource, from: string, to: string): Promise<ReviewItem[]> {
  const base = `https://${s.host}/api/v4`;
  const items: ReviewItem[] = [];
  for (let page = 1; page <= 20; page++) {
    const mrs = await getJson<Array<{ title: string; web_url: string; merged_at: string | null; references?: { full?: string } }>>(
      `${base}/merge_requests?scope=created_by_me&state=merged&updated_after=${from}T00:00:00Z&per_page=100&page=${page}`,
      { 'PRIVATE-TOKEN': s.token },
      'GitLab',
    );
    for (const mr of mrs) {
      const merged = mr.merged_at?.slice(0, 10);
      if (!merged || merged < from || merged > to) continue;
      items.push({ source: s.label, repo: mr.references?.full?.replace(/!\d+$/, '') ?? '', title: mr.title, url: mr.web_url, merged });
    }
    if (mrs.length < 100) break;
  }
  return items;
}

export async function collectShipped(root: string, from: string, to: string): Promise<ReviewItem[]> {
  const items: ReviewItem[] = [];
  for (const s of loadSources(root)) {
    try {
      if (s.type === 'github') items.push(...(await githubItems(s, from, to)));
      if (s.type === 'gitlab') items.push(...(await gitlabItems(s, from, to)));
    } catch (err) {
      console.error(`  skipped ${s.id}: ${(err as Error).message}`);
    }
  }
  return items.sort((a, b) => a.merged.localeCompare(b.merged));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function reviewMarkdown(data: MergedData, from: string, to: string, shipped: ReviewItem[] | null): string {
  const s = windowStats(data, from, to);
  const lines: string[] = [];
  lines.push(`# Work summary: ${from} to ${to}`, '');
  lines.push(`- **${s.total.toLocaleString('en-US')} contributions** on **${s.activeDays} active days** across ${data.sources.length} source(s): ${data.sources.map((x) => x.label).join(', ')}`);
  if (s.busiest) lines.push(`- Busiest day: ${s.busiest.date} (${s.busiest.count})`);
  const top = s.byWeekday.indexOf(Math.max(...s.byWeekday));
  if (s.total) lines.push(`- Most active weekday: ${WEEKDAYS[top]}`);
  if (s.byMonth.size) {
    lines.push('', '## By month', '', '| Month | Contributions |', '| --- | ---: |');
    for (const [month, n] of [...s.byMonth].sort()) lines.push(`| ${month} | ${n.toLocaleString('en-US')} |`);
  }
  if (shipped) {
    lines.push('', `## Shipped (${shipped.length} merged pull/merge requests)`, '');
    if (shipped.length === 0) lines.push('_None found on GitHub/GitLab sources in this window._');
    const byRepo = new Map<string, ReviewItem[]>();
    for (const item of shipped) byRepo.set(item.repo, [...(byRepo.get(item.repo) ?? []), item]);
    for (const [repo, list] of [...byRepo].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`### ${repo} (${list.length})`, '');
      for (const item of list) lines.push(`- ${item.merged} [${item.title.replace(/[[\]]/g, '')}](${item.url})`);
      lines.push('');
    }
  }
  lines.push('', '## Notes for the review', '', '- Impact:', '- Collaboration:', '- Growth:', '');
  lines.push('_Generated locally by contribs.sh. Counts are activity, not output; add the context only you know._');
  return lines.join('\n');
}

export function defaultWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
