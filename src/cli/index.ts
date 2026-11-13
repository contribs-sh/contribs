import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { MergedData } from '../data/types';
import { compileLost, EMPTY_LOST_CONFIG, type LostConfig } from '../data/lost';
import { PRESETS, PRESET_IDS, renderSvg, type PresetId, type Range, type ThemeId } from '../render/svg';
import { findRepos, localAdapter } from '../fetch/adapters/local';
import { runFetch } from '../fetch/run';
import { workflowYaml } from './workflow';
import { collectShipped, defaultWindow, reviewMarkdown } from './review';

const HELP = `contribs.sh — every contribution, every forge, one heatmap.

Usage:
  contribs.sh init [--ci]            create sources.json (and a GitHub Actions workflow with --ci)
  contribs.sh fetch [--out DIR]      fetch + merge all sources (default DIR: public/data)
  contribs.sh banner [options]       render an image from the merged data
  contribs.sh scan DIR... [options]  recover history from local git repos on disk
  contribs.sh review [options]       Markdown work summary for a review / brag doc
  contribs.sh wrapped [YEAR]         year-in-review card (shortcut for banner --preset wrapped)

banner options:
  --preset ID      ${PRESET_IDS.join(' | ')} | all   (default: x)
  --range R        rolling | all | YEAR             (default depends on preset)
  --theme T        dark | light                     (default: dark)
  --title TEXT     heading for card / wrapped / poster layouts
  --out PATH       .png or .svg file; a directory when --preset all (default: contribs-<preset>.png)
  --data PATH      merged data (default: public/data/contributions.json; fetched if missing)
  --scale N        PNG pixel ratio (default: 1)
  --no-stats       hide totals and stats text
  --no-mark        hide the contribs.sh mark
  --transparent    no background fill

review options:
  --from DATE      start of the window (default: 6 months ago)
  --to DATE        end of the window (default: today)
  --no-prs         counts only; skip merged PR/MR lookups (private PRs are always counts only)
  --out PATH       write to a file instead of stdout

scan options:
  --email ADDR     author email to count (repeatable; default: git config user.email)
  --depth N        directory levels to search (default: 4)
  --from DATE      ignore commits before YYYY-MM-DD
  --to DATE        ignore commits after YYYY-MM-DD
`;

const root = process.cwd();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function loadLost(): LostConfig {
  const path = resolve(root, 'lost-ranges.json');
  return existsSync(path) ? readJson<LostConfig>(path) : EMPTY_LOST_CONFIG;
}

function gitEmail(): string | null {
  try {
    return execFileSync('git', ['config', 'user.email'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function ghLogin(): string | null {
  try {
    return execFileSync('gh', ['api', 'user', '-q', '.login'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

async function init(args: string[]) {
  const { values } = parseArgs({ args, options: { ci: { type: 'boolean' } } });
  const sourcesPath = resolve(root, 'sources.json');
  if (existsSync(sourcesPath)) {
    console.log('sources.json already exists — leaving it alone.');
  } else {
    const login = ghLogin();
    const sources = {
      sources: [
        {
          id: 'gh-main',
          label: 'GitHub',
          type: 'github',
          host: 'github.com',
          username: login ?? 'your-github-username',
          ...(values.ci ? { tokenEnv: 'GH_MAIN_TOKEN' } : {}),
          enabled: true,
        },
      ],
    };
    writeFileSync(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`);
    console.log(`Wrote sources.json${login ? ` for ${login}` : ' — edit "username"'}.`);
  }
  if (values.ci) {
    const wf = resolve(root, '.github/workflows/contribs.yml');
    if (existsSync(wf)) {
      console.log('.github/workflows/contribs.yml already exists — leaving it alone.');
    } else {
      mkdirSync(dirname(wf), { recursive: true });
      writeFileSync(wf, workflowYaml());
      console.log('Wrote .github/workflows/contribs.yml. Add a GH_MAIN_TOKEN repo secret (classic PAT: read:user, repo, read:org)');
      console.log('and a CONTRIBS_SOURCES secret holding your sources.json, then enable GitHub Pages → "GitHub Actions".');
    }
  }
  console.log('Next: contribs.sh fetch && contribs.sh banner');
}

async function fetchCmd(args: string[]) {
  const { values } = parseArgs({ args, options: { out: { type: 'string' } } });
  await runFetch(root, resolve(root, values.out ?? 'public/data'));
}

async function toPng(svg: string, scale: number): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, {
    fitTo: scale === 1 ? { mode: 'original' } : { mode: 'zoom', value: scale },
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
  });
  return resvg.render().asPng();
}

async function banner(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      preset: { type: 'string', default: 'x' },
      range: { type: 'string' },
      theme: { type: 'string', default: 'dark' },
      title: { type: 'string' },
      out: { type: 'string' },
      data: { type: 'string' },
      scale: { type: 'string', default: '1' },
      'no-stats': { type: 'boolean' },
      'no-mark': { type: 'boolean' },
      transparent: { type: 'boolean' },
    },
  });

  const presets: PresetId[] = values.preset === 'all' ? PRESET_IDS : [values.preset as PresetId];
  for (const p of presets) if (!PRESETS[p]) fail(`Unknown preset "${p}". Use one of: ${PRESET_IDS.join(', ')}, all`);
  if (values.theme !== 'dark' && values.theme !== 'light') fail('--theme must be dark or light');
  const range: Range | undefined = values.range === undefined ? undefined
    : values.range === 'rolling' || values.range === 'all' ? values.range
    : /^\d{4}$/.test(values.range) ? Number(values.range) : fail('--range must be rolling, all, or a year');
  const scale = Number(values.scale);
  if (!(scale > 0 && scale <= 4)) fail('--scale must be between 0 and 4');

  const data = await loadData(values.data);

  const lostFor = compileLost(loadLost());
  for (const preset of presets) {
    let out = values.out ?? `contribs-${preset}.png`;
    if (presets.length > 1) {
      const dir = resolve(root, values.out ?? 'banners');
      mkdirSync(dir, { recursive: true });
      out = join(dir, `${preset}.png`);
    }
    const svg = renderSvg(data, {
      preset,
      range,
      theme: values.theme as ThemeId,
      title: values.title,
      stats: !values['no-stats'],
      mark: !values['no-mark'],
      transparent: values.transparent,
      lostFor,
    });
    const target = resolve(root, out);
    mkdirSync(dirname(target), { recursive: true });
    if (extname(target).toLowerCase() === '.svg') {
      writeFileSync(target, svg);
    } else {
      writeFileSync(target, await toPng(svg, scale));
      if (presets.length > 1) writeFileSync(target.replace(/\.png$/, '.svg'), svg);
    }
    console.log(`Wrote ${target} (${PRESETS[preset].label})`);
  }
}

async function scan(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      email: { type: 'string', multiple: true },
      depth: { type: 'string', default: '4' },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  });
  if (positionals.length === 0) fail('Usage: contribs.sh scan DIR... [--email ADDR]');
  const emails = values.email?.length ? values.email : [gitEmail()].filter((e): e is string => !!e);
  if (emails.length === 0) fail('No author email: pass --email or set git config user.email');
  const depth = Number(values.depth);

  const repos = [...new Set(positionals.flatMap((p) => findRepos(p, depth)))];
  console.log(`Found ${repos.length} repo(s) under ${positionals.join(', ')}; counting commits by ${emails.join(', ')}…`);
  const result = await localAdapter({
    id: 'local-scan', label: 'Local repos', type: 'local', host: '', username: '', token: '',
    paths: positionals, emails, depth, from: values.from, to: values.to,
  });

  const byYear = new Map<string, number>();
  for (const [date, count] of Object.entries(result.days)) byYear.set(date.slice(0, 4), (byYear.get(date.slice(0, 4)) ?? 0) + count);
  const total = [...byYear.values()].reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log('No matching commits. Check the email(s) your old commits used: git log --format=%ae | sort -u');
    return;
  }
  for (const [year, count] of [...byYear].sort()) console.log(`  ${year}  ${String(count).padStart(6)} commits`);
  console.log(`  total ${String(total).padStart(6)} commits (${result.coverage.from} → ${result.coverage.to})\n`);
  console.log('Add this to sources.json to merge it (set from/to to the years GitHub is missing):');
  console.log(JSON.stringify({
    id: 'local-history',
    label: 'Recovered (local git)',
    type: 'local',
    paths: positionals,
    emails,
    from: values.from ?? result.coverage.from,
    to: values.to ?? result.coverage.to,
    enabled: true,
  }, null, 2));
}

async function loadData(path?: string): Promise<MergedData> {
  const dataPath = resolve(root, path ?? 'public/data/contributions.json');
  if (existsSync(dataPath)) return readJson<MergedData>(dataPath);
  if (path) fail(`No data at ${dataPath}`);
  return runFetch(root, dirname(dataPath));
}

async function review(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      data: { type: 'string' },
      out: { type: 'string' },
      'no-prs': { type: 'boolean' },
    },
  });
  const def = defaultWindow();
  const from = values.from ?? def.from;
  const to = values.to ?? def.to;
  for (const d of [from, to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) fail('--from/--to must be YYYY-MM-DD');
  const data = await loadData(values.data);
  const shipped = values['no-prs'] ? null : await collectShipped(root, from, to);
  const md = reviewMarkdown(data, from, to, shipped);
  if (values.out) {
    writeFileSync(resolve(root, values.out), `${md}\n`);
    console.error(`Wrote ${resolve(root, values.out)}`);
  } else {
    process.stdout.write(`${md}\n`);
  }
}

async function wrapped(args: string[]) {
  const year = args[0] && /^\d{4}$/.test(args[0]) ? args.shift()! : String(new Date().getUTCFullYear());
  await banner(['--preset', 'wrapped', '--range', year, '--out', `contribs-wrapped-${year}.png`, ...args]);
}

const commands: Record<string, (args: string[]) => Promise<void>> = { init, fetch: fetchCmd, banner, scan, review, wrapped };

const [command, ...rest] = process.argv.slice(2);
if (!command || command === '-h' || command === '--help' || command === 'help') {
  process.stdout.write(HELP);
} else if (!commands[command]) {
  fail(`Unknown command "${command}".\n\n${HELP}`);
} else {
  commands[command](rest).catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
}
