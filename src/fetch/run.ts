import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { githubAdapter } from './adapters/github';
import { forgejoAdapter } from './adapters/forgejo';
import { gitlabAdapter } from './adapters/gitlab';
import { bitbucketAdapter } from './adapters/bitbucket';
import { azureAdapter } from './adapters/azure';
import { jsonAdapter } from './adapters/json';
import { localAdapter } from './adapters/local';
import type { Adapter, SourceResult, SourceType } from './adapters/types';
import type { MergedData } from '../data/types';
import { merge } from './merge';
import { applyWindow } from './window';
import { loadSources } from './sources';

const adapters: Record<SourceType, Adapter> = {
  github: githubAdapter,
  gitlab: gitlabAdapter,
  bitbucket: bitbucketAdapter,
  azure: azureAdapter,
  forgejo: forgejoAdapter,
  gitea: forgejoAdapter,
  local: localAdapter,
  json: jsonAdapter,
};

/**
 * Fetch every enabled source in `<root>/sources.json`, write per-source files and the
 * merged document to `<outDir>`, and return the merged data. Throws when nothing usable
 * was fetched.
 */
export async function runFetch(root: string, outDir = resolve(root, 'public/data')): Promise<MergedData> {
  const sources = loadSources(root);
  if (sources.length === 0) {
    throw new Error('No usable sources. Copy sources.example.json → sources.json (or run `contribs.sh init`) and enable at least one.');
  }

  mkdirSync(resolve(outDir, 'sources'), { recursive: true });

  const results: SourceResult[] = [];
  for (const source of sources) {
    process.stdout.write(`Fetching ${source.label} (${source.id})… `);
    try {
      const result = applyWindow(await adapters[source.type](source), source.from, source.to);
      results.push(result);
      writeFileSync(resolve(outDir, 'sources', `${source.id}.json`), JSON.stringify(result, null, 2));
      const count = Object.values(result.days).reduce((a, b) => a + b, 0);
      console.log(`✓ ${count} contributions (${result.coverage.from} → ${result.coverage.to})`);
    } catch (err) {
      console.log('✗');
      console.error(`  ${(err as Error).message}`);
    }
  }

  if (results.length === 0) throw new Error('All sources failed.');

  const merged = merge(results, new Date().toISOString());
  writeFileSync(resolve(outDir, 'contributions.json'), JSON.stringify(merged));

  const grandTotal = merged.years.reduce((a, y) => a + y.total, 0);
  console.log(`\nMerged ${results.length} source(s) → ${merged.years.length} year(s), ${grandTotal} total contributions.`);
  console.log(`Wrote ${resolve(outDir, 'contributions.json')}`);
  return merged;
}
