import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { githubAdapter } from './adapters/github';
import { forgejoAdapter } from './adapters/forgejo';
import type { Adapter, SourceResult } from './adapters/types';
import { merge } from './merge';
import { loadSources } from './sources';

const ROOT = resolve(import.meta.dirname, '../..');
const DATA_DIR = resolve(ROOT, 'public/data');

const adapters: Record<'github' | 'forgejo', Adapter> = {
  github: githubAdapter,
  forgejo: forgejoAdapter,
};

async function main() {
  const sources = loadSources();
  if (sources.length === 0) {
    console.error('No usable sources. Copy sources.example.json → sources.json and enable at least one.');
    process.exit(1);
  }

  mkdirSync(resolve(DATA_DIR, 'sources'), { recursive: true });

  const results: SourceResult[] = [];
  for (const source of sources) {
    process.stdout.write(`Fetching ${source.label} (${source.id})… `);
    try {
      const result = await adapters[source.type](source);
      results.push(result);
      writeFileSync(
        resolve(DATA_DIR, 'sources', `${source.id}.json`),
        JSON.stringify(result, null, 2),
      );
      const count = Object.values(result.days).reduce((a, b) => a + b, 0);
      console.log(`✓ ${count} contributions (${result.coverage.from} → ${result.coverage.to})`);
    } catch (err) {
      console.log('✗');
      console.error(`  ${(err as Error).message}`);
    }
  }

  if (results.length === 0) {
    console.error('All sources failed.');
    process.exit(1);
  }

  const merged = merge(results, new Date().toISOString());
  writeFileSync(resolve(DATA_DIR, 'contributions.json'), JSON.stringify(merged));

  const grandTotal = merged.years.reduce((a, y) => a + y.total, 0);
  console.log(
    `\nMerged ${results.length} source(s) → ${merged.years.length} year(s), ` +
      `${grandTotal} total contributions.`,
  );
  console.log(`Wrote ${resolve(DATA_DIR, 'contributions.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
