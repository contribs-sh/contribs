/**
 * Generate the README images from synthetic data, so no real account data is ever committed.
 *   npm run demo   → assets/*.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { merge } from '../src/fetch/merge';
import type { SourceResult } from '../src/fetch/adapters/types';
import { compileLost, type LostConfig } from '../src/data/lost';
import { renderSvg, type RenderOptions } from '../src/render/svg';

const OUT = resolve(import.meta.dirname, '../assets');
const TODAY = '2026-11-01';

// Deterministic PRNG (mulberry32) so the images only change when this script does.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function source(id: string, label: string, from: string, to: string, seed: number, weekdayRate: number, weekendRate: number, max: number): SourceResult {
  const rand = rng(seed);
  const days: Record<string, number> = {};
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += 86_400_000) {
    const date = new Date(ms).toISOString().slice(0, 10);
    const dow = new Date(ms).getUTCDay();
    const rate = dow === 0 || dow === 6 ? weekendRate : weekdayRate;
    if (rand() < rate) days[date] = 1 + Math.floor(rand() ** 2 * max);
  }
  return { id, label, type: 'github', days, coverage: { from, to } };
}

const personal = source('gh-personal', 'GitHub (personal)', '2012-03-01', TODAY, 7, 0.12, 0.35, 8);
const work = source('gh-work', 'GitHub Enterprise (work)', '2021-06-01', TODAY, 11, 0.7, 0.05, 14);
const lost: LostConfig = {
  enabled: true,
  label: 'History on another platform',
  ranges: [
    { id: 'gitlab', label: 'Self-hosted GitLab', from: '2015-02-01', to: '2018-05-31', days: 'weekdays', note: 'Old job on a self-hosted GitLab', color: '#8e9fbf' },
    { id: 'mercurial', label: 'Mercurial', from: '2018-06-01', to: '2021-05-31', days: 'weekdays', note: 'Agency work on Mercurial', color: '#a371f7' },
  ],
};

const generatedAt = `${TODAY}T12:00:00.000Z`;
const before = merge([personal], generatedAt);
const after = merge([personal, work], generatedAt);
const lostFor = compileLost(lost);

function write(name: string, data: typeof after, options: RenderOptions) {
  const svg = renderSvg(data, { today: TODAY, ...options });
  const png = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' } }).render().asPng();
  writeFileSync(resolve(OUT, `${name}.png`), png);
  console.log(`assets/${name}.png`);
}

mkdirSync(OUT, { recursive: true });
write('hero-x', after, { preset: 'x' });
write('before', before, { preset: 'og', title: 'GitHub shows' });
write('after', after, { preset: 'og', title: 'contribs.sh shows' });
write('wrapped', after, { preset: 'wrapped', range: 2026 });
const poster = renderSvg(after, { preset: 'poster', title: 'Every year, every forge', lostFor, today: TODAY });
const posterPng = new Resvg(poster, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' } }).render().asPng();
writeFileSync(resolve(OUT, 'poster.png'), posterPng);
console.log('assets/poster.png');
