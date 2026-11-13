/**
 * Offline adapter tests: replay canned API responses through each REST adapter.
 *   npm test
 */
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitlabAdapter } from '../src/fetch/adapters/gitlab';
import { bitbucketAdapter } from '../src/fetch/adapters/bitbucket';
import { azureAdapter } from '../src/fetch/adapters/azure';
import { jsonAdapter } from '../src/fetch/adapters/json';
import { reviewMarkdown, type ReviewItem } from '../src/cli/review';
import { merge } from '../src/fetch/merge';
import type { ResolvedSource } from '../src/fetch/adapters/types';

type Route = [RegExp, unknown];
function mockFetch(routes: Route[]) {
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

const base = (over: Partial<ResolvedSource>): ResolvedSource => ({
  id: 't', label: 'T', type: 'github', host: '', username: 'me', token: 'x', ...over,
});

const tests: Array<[string, () => Promise<void>]> = [
  ['gitlab counts pushes by commit_count and other events as 1', async () => {
    mockFetch([
      [/\/api\/v4\/user$/, { id: 1, username: 'me' }],
      [/\/api\/v4\/events/, [
        { created_at: '2026-03-02T10:00:00Z', action_name: 'pushed to', push_data: { commit_count: 3 } },
        { created_at: '2026-03-02T11:00:00Z', action_name: 'opened' },
        { created_at: '2026-03-05T09:00:00Z', action_name: 'commented on' },
      ]],
    ]);
    const r = await gitlabAdapter(base({ type: 'gitlab', host: 'gitlab.com' }));
    assert.deepEqual(r.days, { '2026-03-02': 4, '2026-03-05': 1 });
    assert.equal(r.type, 'gitlab');
  }],
  ['gitlab rejects a token for a different user', async () => {
    mockFetch([[/\/api\/v4\/user$/, { id: 2, username: 'someone' }]]);
    await assert.rejects(gitlabAdapter(base({ type: 'gitlab', host: 'gitlab.com' })), /belongs to "someone"/);
  }],
  ['bitbucket keeps own commits (account or email), dedupes hashes, stops at from', async () => {
    mockFetch([
      [/\/2\.0\/user$/, { account_id: 'A' }],
      [/\/repositories\?role=member/, { values: [{ full_name: 'ws/one' }, { full_name: 'ws/fork' }] }],
      [/\/repositories\/ws\/(one|fork)\/commits/, { values: [
        { hash: 'h1', date: '2026-02-03T10:00:00Z', author: { raw: 'Me <me@x.io>', user: { account_id: 'A' } } },
        { hash: 'h2', date: '2026-02-03T12:00:00Z', author: { raw: 'Old me <old@x.io>' } },
        { hash: 'h3', date: '2026-02-02T12:00:00Z', author: { raw: 'Other <o@x.io>', user: { account_id: 'B' } } },
        { hash: 'h0', date: '2025-01-01T12:00:00Z', author: { raw: 'Me <me@x.io>', user: { account_id: 'A' } } },
      ] }],
    ]);
    const r = await bitbucketAdapter(base({ type: 'bitbucket', host: 'bitbucket.org', emails: ['old@x.io'], from: '2026-01-01' }));
    assert.deepEqual(r.days, { '2026-02-03': 2 });
  }],
  ['azure matches author email across projects and dedupes commit ids', async () => {
    mockFetch([
      [/_apis\/projects/, { value: [{ name: 'P1' }, { name: 'P2' }] }],
      [/_apis\/git\/repositories\?api/, { value: [{ id: 'r1', name: 'r1' }] }],
      [/_apis\/git\/repositories\/r1\/commits/, { value: [
        { commitId: 'c1', author: { email: 'me@corp.io', date: '2026-04-01T08:00:00Z' } },
        { commitId: 'c2', author: { email: 'ME@corp.io', date: '2026-04-01T09:00:00Z' } },
        { commitId: 'c3', author: { email: 'else@corp.io', date: '2026-04-02T09:00:00Z' } },
      ] }],
    ]);
    const r = await azureAdapter(base({ type: 'azure', host: 'dev.azure.com/org', emails: ['me@corp.io'] }));
    assert.deepEqual(r.days, { '2026-04-01': 2 });
  }],
  ['json reads a local file and ignores invalid entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'contribs-'));
    const file = join(dir, 'data.json');
    writeFileSync(file, JSON.stringify({ '2026-01-02': 3, '2026-01-03': 0, nope: 4, '2026-01-04': 'x' }));
    const r = await jsonAdapter(base({ type: 'json', url: file }));
    assert.deepEqual(r.days, { '2026-01-02': 3 });
  }],
  ['review names public repos only and reduces private ones to counts', async () => {
    const data = merge([{ id: 'a', label: 'Acme Corp work', type: 'github', days: { '2026-03-02': 4 }, coverage: { from: '2026-01-01', to: '2026-03-31' } }], '2026-03-31T00:00:00Z');
    const shipped: ReviewItem[] = [
      { repo: 'me/open-thing', title: 'Add dark mode', url: 'https://github.com/me/open-thing/pull/1', merged: '2026-03-02', public: true },
      { repo: '', title: '', url: '', merged: '2026-03-03', public: false },
      { repo: '', title: '', url: '', merged: '2026-02-10', public: false },
    ];
    const md = reviewMarkdown(data, '2026-01-01', '2026-03-31', shipped);
    assert.match(md, /2 in private or work repos/);
    assert.match(md, /2026-02: 1 · 2026-03: 1/);
    assert.match(md, /### me\/open-thing \(1\)/);
    assert.doesNotMatch(md, /Acme/, 'source labels can name an employer and must not appear');
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n  ${(err as Error).message}`);
  }
}
if (failed) process.exit(1);
