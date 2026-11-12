import type { Adapter } from './types';
import { basicAuth, bucketByDay, coverageOf, getJson } from './http';

interface List<T> {
  value: T[];
}
interface Project {
  name: string;
}
interface Repo {
  id: string;
  name: string;
}
interface Commit {
  commitId: string;
  author: { email: string; date: string };
}

/**
 * Azure DevOps (Azure Repos) adapter. Walks every Git repo in the organization and counts
 * commits whose author email is in `emails`, de-duplicated by commit id.
 * Config: `host` = organization URL host + path, e.g. `dev.azure.com/your-org`
 * (or `your-org.visualstudio.com`). Token = PAT with Code (Read).
 */
export const azureAdapter: Adapter = async (source) => {
  const org = `https://${source.host.replace(/\/+$/, '')}`;
  const headers = { Authorization: basicAuth('', source.token) };
  const emails = (source.emails ?? []).map((e) => e.toLowerCase());
  if (emails.length === 0) throw new Error(`Azure DevOps source ${source.id} needs "emails"`);

  const projects = await getJson<List<Project>>(`${org}/_apis/projects?$top=500&api-version=7.1`, headers, 'Azure DevOps');
  const seen = new Set<string>();
  const stamps: string[] = [];
  for (const project of projects.value) {
    const p = encodeURIComponent(project.name);
    const repos = await getJson<List<Repo>>(`${org}/${p}/_apis/git/repositories?api-version=7.1`, headers, 'Azure DevOps');
    for (const repo of repos.value) {
      for (const email of emails) {
        for (let skip = 0; ; skip += 1000) {
          const q = new URLSearchParams({
            'searchCriteria.author': email,
            'searchCriteria.$top': '1000',
            'searchCriteria.$skip': String(skip),
            'api-version': '7.1',
          });
          if (source.from) q.set('searchCriteria.fromDate', source.from);
          if (source.to) q.set('searchCriteria.toDate', `${source.to}T23:59:59Z`);
          let commits: List<Commit>;
          try {
            commits = await getJson<List<Commit>>(`${org}/${p}/_apis/git/repositories/${repo.id}/commits?${q}`, headers, 'Azure DevOps');
          } catch {
            break; // empty repo
          }
          for (const c of commits.value) {
            if (seen.has(c.commitId) || c.author.email.toLowerCase() !== email) continue;
            seen.add(c.commitId);
            stamps.push(c.author.date);
          }
          if (commits.value.length < 1000) break;
        }
      }
    }
  }

  const days = bucketByDay(stamps);
  return { id: source.id, label: source.label, type: 'azure', days, coverage: coverageOf(days, source.from, source.to) };
};
