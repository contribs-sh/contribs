import type { Adapter } from './types';
import { basicAuth, bucketByDay, coverageOf, getJson } from './http';

interface Page<T> {
  values: T[];
  next?: string;
}
interface Repo {
  full_name: string;
}
interface Commit {
  hash: string;
  date: string;
  author: { raw: string; user?: { account_id?: string } };
}

/**
 * Bitbucket Cloud adapter. Bitbucket has no contribution calendar, so this lists every
 * repository you're a member of and counts commits you authored, de-duplicated by hash.
 * A commit counts when its author is linked to your account or its author email is in
 * `emails`. Use `from`/`to` to bound the walk on large workspaces.
 * Auth: `username` = your Bitbucket username (or Atlassian account email), token = an API
 * token / app password with `read:repository` (`account` + `repository` scopes).
 */
export const bitbucketAdapter: Adapter = async (source) => {
  const base = 'https://api.bitbucket.org/2.0';
  const headers = { Authorization: basicAuth(source.username, source.token) };
  const me = await getJson<{ account_id: string }>(`${base}/user`, headers, 'Bitbucket');
  const emails = new Set((source.emails ?? []).map((e) => e.toLowerCase()));

  const repos: Repo[] = [];
  for (let url: string | undefined = `${base}/repositories?role=member&pagelen=100`; url; ) {
    const page: Page<Repo> = await getJson<Page<Repo>>(url, headers, 'Bitbucket');
    repos.push(...page.values);
    url = page.next;
  }

  const seen = new Set<string>();
  const stamps: string[] = [];
  for (const repo of repos) {
    let url: string | undefined = `${base}/repositories/${repo.full_name}/commits?pagelen=100`;
    pages: while (url) {
      let page: Page<Commit>;
      try {
        page = await getJson<Page<Commit>>(url, headers, 'Bitbucket');
      } catch {
        break; // empty repo or no access
      }
      for (const c of page.values) {
        const date = c.date.slice(0, 10);
        if (source.from && date < source.from) break pages; // commits are newest first
        if (source.to && date > source.to) continue;
        if (seen.has(c.hash)) continue;
        const email = /<([^>]+)>/.exec(c.author.raw)?.[1]?.toLowerCase();
        if (c.author.user?.account_id !== me.account_id && !(email && emails.has(email))) continue;
        seen.add(c.hash);
        stamps.push(date);
      }
      url = page.next;
    }
  }

  const days = bucketByDay(stamps);
  return { id: source.id, label: source.label, type: 'bitbucket', days, coverage: coverageOf(days, source.from, source.to) };
};
