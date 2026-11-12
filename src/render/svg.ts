/**
 * Framework-free SVG renderer for contribution heatmaps. One code path serves the
 * browser export menu (SVG → canvas → PNG) and the CLI (SVG → resvg → PNG), so a
 * banner looks identical wherever it is produced.
 */
import type { MergedData } from '../data/types';
import type { LostHit } from '../data/lost';

export type PresetId = 'x' | 'linkedin' | 'og' | 'github' | 'wrapped' | 'poster';
type Layout = 'banner' | 'card' | 'wrapped' | 'poster';

export interface Preset {
  id: PresetId;
  label: string;
  width: number;
  height: number;
  layout: Layout;
}

export const PRESETS: Record<PresetId, Preset> = {
  x: { id: 'x', label: 'X header (1500×500)', width: 1500, height: 500, layout: 'banner' },
  linkedin: { id: 'linkedin', label: 'LinkedIn banner (1584×396)', width: 1584, height: 396, layout: 'banner' },
  og: { id: 'og', label: 'Open Graph (1200×630)', width: 1200, height: 630, layout: 'card' },
  github: { id: 'github', label: 'GitHub social preview (1280×640)', width: 1280, height: 640, layout: 'card' },
  wrapped: { id: 'wrapped', label: 'Wrapped story (1080×1350)', width: 1080, height: 1350, layout: 'wrapped' },
  poster: { id: 'poster', label: 'Poster 18×24 in @300dpi', width: 5400, height: 7200, layout: 'poster' },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** `rolling` = last 53 weeks; a number = that calendar year; `all` = every year (poster). */
export type Range = 'rolling' | 'all' | number;
export type ThemeId = 'dark' | 'light';

interface Theme {
  bg: string;
  text: string;
  muted: string;
  ramp: [string, string, string, string, string];
  nodata: string;
  stripe: string;
  future: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  dark: {
    bg: '#0d1117',
    text: '#e6edf3',
    muted: '#8b949e',
    ramp: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    nodata: '#1c2128',
    stripe: 'rgba(139,148,158,0.35)',
    future: '#30363d',
  },
  light: {
    bg: '#ffffff',
    text: '#1f2328',
    muted: '#59636e',
    ramp: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    nodata: '#f6f8fa',
    stripe: 'rgba(89,99,110,0.3)',
    future: '#d0d7de',
  },
};

export interface RenderOptions {
  preset: PresetId;
  range?: Range;
  theme?: ThemeId;
  /** Show headline total and stats text (default true). */
  stats?: boolean;
  /** Show the small `contribs.sh` mark (default true). */
  mark?: boolean;
  /** Omit the background fill. */
  transparent?: boolean;
  /** Small heading on card/poster layouts (e.g. a name or handle). */
  title?: string;
  /** Lost/incomplete-history lookup; matching zero days are drawn in the range color. */
  lostFor?: (date: string) => LostHit | null;
  /** ISO date treated as today (defaults to the data's fetch date). */
  today?: string;
}

const FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MS_DAY = 86_400_000;

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * MS_DAY).toISOString().slice(0, 10);
}
function dow(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

type DayInfo = { count: number; known: boolean };

function dayMap(data: MergedData): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  for (const year of data.years) {
    for (const week of year.weeks) {
      for (const day of week.days) {
        if (Number(day.date.slice(0, 4)) === year.year) map.set(day.date, { count: day.count, known: day.known });
      }
    }
  }
  return map;
}

/** Week columns (Sunday → Saturday); `null` marks padding cells outside the range. */
function weeksFor(range: 'rolling' | number, today: string): Array<Array<string | null>> {
  const weeks: Array<Array<string | null>> = [];
  if (range === 'rolling') {
    const start = addDays(addDays(today, -dow(today)), -52 * 7);
    for (let w = 0; w < 53; w++) {
      weeks.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
    }
    return weeks;
  }
  const jan1 = `${range}-01-01`;
  const dec31 = `${range}-12-31`;
  let cursor = addDays(jan1, -dow(jan1));
  while (cursor <= dec31) {
    weeks.push(Array.from({ length: 7 }, (_, d) => {
      const date = addDays(cursor, d);
      return date.startsWith(`${range}-`) ? date : null;
    }));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

interface RangeStats {
  total: number;
  activeDays: number;
  busiest: { date: string; count: number } | null;
}

/** Same semantics as the dashboard: lost days count 1 each toward total and active days. */
function rangeStats(dates: string[], days: Map<string, DayInfo>, today: string, lostFor?: RenderOptions['lostFor']): RangeStats {
  let total = 0;
  let activeDays = 0;
  let busiest: RangeStats['busiest'] = null;
  for (const date of [...dates].sort()) {
    if (date > today) continue;
    const info = days.get(date);
    if (info?.known && info.count > 0) {
      total += info.count;
      activeDays++;
      if (!busiest || info.count > busiest.count) busiest = { date, count: info.count };
      continue;
    }
    if (lostFor?.(date)) {
      total++;
      activeDays++;
    }
  }
  return { total, activeDays, busiest };
}

interface GridCtx {
  days: Map<string, DayInfo>;
  theme: Theme;
  today: string;
  lostFor?: RenderOptions['lostFor'];
}

function cellFill(date: string, ctx: GridCtx): string | null {
  if (date > ctx.today) return null;
  const info = ctx.days.get(date);
  if (info && info.count > 0) return ctx.theme.ramp[level(info.count)];
  const hit = ctx.lostFor?.(date);
  if (hit) return hit.color;
  if (!info || !info.known) return 'url(#nodata)';
  return ctx.theme.ramp[0];
}

function grid(weeks: Array<Array<string | null>>, x: number, y: number, cell: number, ctx: GridCtx): string {
  const gap = cell * 0.2;
  const r = (cell * 0.2).toFixed(2);
  const parts: string[] = [];
  weeks.forEach((week, col) => {
    week.forEach((date, row) => {
      if (!date) return;
      const cx = (x + col * (cell + gap)).toFixed(2);
      const cy = (y + row * (cell + gap)).toFixed(2);
      const fill = cellFill(date, ctx);
      if (fill === null) {
        parts.push(`<rect x="${cx}" y="${cy}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${r}" fill="none" stroke="${ctx.theme.future}" stroke-width="${(cell * 0.06).toFixed(2)}" opacity="0.5"/>`);
      } else {
        parts.push(`<rect x="${cx}" y="${cy}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${r}" fill="${fill}"/>`);
      }
    });
  });
  return parts.join('');
}

const gridH = (cell: number) => 7 * cell * 1.2 - cell * 0.2;

function text(x: number, y: number, size: number, fill: string, content: string, opts: { weight?: number; anchor?: 'start' | 'middle' | 'end' } = {}): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${size.toFixed(1)}" font-weight="${opts.weight ?? 400}" fill="${fill}" text-anchor="${opts.anchor ?? 'start'}">${esc(content)}</text>`;
}

function rangeLabel(range: 'rolling' | number): string {
  return range === 'rolling' ? 'contributions in the last year' : `contributions in ${range}`;
}

function statLine(s: RangeStats): string {
  return s.busiest
    ? `${fmt(s.activeDays)} active days · busiest day ${fmt(s.busiest.count)} on ${s.busiest.date}`
    : `${fmt(s.activeDays)} active days`;
}

/** Render a contribution heatmap image as a standalone SVG string. */
export function renderSvg(data: MergedData, options: RenderOptions): string {
  const preset = PRESETS[options.preset];
  const theme = THEMES[options.theme ?? 'dark'];
  const today = options.today ?? data.generatedAt.slice(0, 10);
  const showStats = options.stats !== false;
  const showMark = options.mark !== false;
  const days = dayMap(data);
  const ctx: GridCtx = { days, theme, today, lostFor: options.lostFor };
  const { width: W, height: H } = preset;

  const body: string[] = [];
  let range: Range = options.range ?? (preset.layout === 'wrapped' ? Number(today.slice(0, 4)) : preset.layout === 'poster' ? 'all' : 'rolling');
  if (range === 'all' && preset.layout !== 'poster') range = 'rolling';

  if (preset.layout === 'poster') {
    body.push(poster(data, range, ctx, W, H, options.title, showStats));
  } else {
    const r = range as 'rolling' | number;
    const weeks = weeksFor(r, today);
    const stats = rangeStats(weeks.flat().filter((d): d is string => d !== null), days, today, options.lostFor);

    if (preset.layout === 'banner') {
      // Keep content right of the profile photo (bottom-left on X and LinkedIn) and
      // inside the vertical band that survives mobile cropping.
      const left = W * 0.25;
      const right = W * 0.95;
      const head = showStats ? H * 0.11 : 0;
      const sub = showStats ? H * 0.045 : 0;
      let cell = (right - left) / (weeks.length * 1.2 - 0.2);
      const blockH = (c: number) => (showStats ? head + sub * 1.6 + H * 0.04 : 0) + gridH(c) + (showStats ? H * 0.04 + sub : 0);
      while (blockH(cell) > H * 0.76) cell *= 0.95;
      let y = (H - blockH(cell)) / 2;
      if (showStats) {
        y += head;
        body.push(text(left, y, head, theme.text, fmt(stats.total), { weight: 700 }));
        body.push(text(left + head * 0.62 * fmt(stats.total).length + head * 0.25, y, sub * 1.2, theme.muted, rangeLabel(r)));
        y += H * 0.05;
      }
      body.push(grid(weeks, left, y, cell, ctx));
      y += gridH(cell);
      if (showStats) body.push(text(left, y + H * 0.04 + sub, sub, theme.muted, statLine(stats)));
    } else if (preset.layout === 'card') {
      const pad = W * 0.06;
      let y = pad;
      if (options.title) {
        y += H * 0.06;
        body.push(text(pad, y, H * 0.055, theme.muted, options.title, { weight: 600 }));
        y += H * 0.03;
      }
      if (showStats) {
        y += H * 0.12;
        body.push(text(pad, y, H * 0.12, theme.text, fmt(stats.total), { weight: 700 }));
        y += H * 0.06;
        body.push(text(pad, y, H * 0.04, theme.muted, rangeLabel(r)));
        y += H * 0.05;
      }
      const cell = (W - pad * 2) / (weeks.length * 1.2 - 0.2);
      const spare = H - pad - (showStats ? H * 0.08 : 0) - y - gridH(cell);
      y += Math.max(0, spare / 2);
      body.push(grid(weeks, pad, y, cell, ctx));
      if (showStats) body.push(text(pad, H - pad, H * 0.035, theme.muted, statLine(stats)));
    } else {
      // wrapped
      const pad = W * 0.07;
      const year = r === 'rolling' ? 'My year' : String(r);
      let y = pad + H * 0.06;
      body.push(text(pad, y, H * 0.05, theme.muted, options.title ?? `${year} in code`, { weight: 600 }));
      y += H * 0.15;
      body.push(text(pad, y, H * 0.13, theme.text, fmt(stats.total), { weight: 800 }));
      y += H * 0.05;
      body.push(text(pad, y, H * 0.03, theme.muted, 'contributions'));
      y += H * 0.08;
      const tiles: Array<[string, string]> = [
        [fmt(stats.activeDays), 'active days'],
        [stats.activeDays ? (stats.total / stats.activeDays).toFixed(1) : '0', 'per active day'],
        [stats.busiest ? fmt(stats.busiest.count) : '0', stats.busiest ? `on ${stats.busiest.date}, busiest day` : 'busiest day'],
      ];
      const labelX = pad + H * 0.05 * 0.62 * Math.max(...tiles.map(([value]) => value.length)) + H * 0.025;
      for (const [value, label] of tiles) {
        y += H * 0.065;
        body.push(text(pad, y, H * 0.05, theme.ramp[4], value, { weight: 700 }));
        body.push(text(labelX, y, H * 0.026, theme.muted, label));
        y += H * 0.02;
      }
      const cell = (W - pad * 2) / (weeks.length * 1.2 - 0.2);
      y = Math.max(y + H * 0.06, H - pad - H * 0.06 - gridH(cell));
      body.push(grid(weeks, pad, y, cell, ctx));
    }
  }

  if (showMark) {
    const size = Math.max(12, Math.min(W, H) * 0.035);
    body.push(text(W - size * 1.2, H - size * 1.1, size, theme.muted, 'contribs.sh', { weight: 600, anchor: 'end' }));
  }

  const hatch = Math.max(2, Math.min(W, H) / 250);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><pattern id="nodata" width="${hatch * 2}" height="${hatch * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`,
    `<rect width="${hatch * 2}" height="${hatch * 2}" fill="${theme.nodata}"/><rect width="${hatch}" height="${hatch * 2}" fill="${theme.stripe}"/></pattern></defs>`,
    options.transparent ? '' : `<rect width="${W}" height="${H}" fill="${theme.bg}"/>`,
    ...body,
    '</svg>',
  ].join('');
}

function poster(data: MergedData, range: Range, ctx: GridCtx, W: number, H: number, title: string | undefined, showStats: boolean): string {
  const years = typeof range === 'number' ? [range] : data.years.map((y) => y.year).sort((a, b) => a - b);
  const pad = W * 0.06;
  const head = H * 0.1;
  const availW = W - pad * 2;
  const availH = H - pad * 2 - head;
  // Pick the column count that gives the largest cells.
  let best = { cols: 1, cell: 0 };
  for (let cols = 1; cols <= 4; cols++) {
    const rows = Math.ceil(years.length / cols);
    const cell = Math.min(availW / (cols * 63.6 + (cols - 1) * 3), availH / (rows * 11.4 + (rows - 1) * 1.5));
    if (cell > best.cell) best = { cols, cell };
  }
  const { cols, cell } = best;
  const rows = Math.ceil(years.length / cols);
  const blockW = 63.6 * cell;
  const blockH = 11.4 * cell;
  const usedW = cols * blockW + (cols - 1) * 3 * cell;
  const usedH = rows * blockH + (rows - 1) * 1.5 * cell;
  const x0 = (W - usedW) / 2;
  const y0 = pad + head + (availH - usedH) / 2;

  const parts: string[] = [];
  const all = years.flatMap((y) => weeksFor(y, ctx.today).flat().filter((d): d is string => d !== null));
  const stats = rangeStats(all, ctx.days, ctx.today, ctx.lostFor);
  parts.push(text(pad, pad + head * 0.45, head * 0.38, ctx.theme.text, title ?? 'Contribution history', { weight: 700 }));
  if (showStats) {
    const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0]);
    parts.push(text(pad, pad + head * 0.8, head * 0.16, ctx.theme.muted, `${fmt(stats.total)} contributions · ${span} · ${fmt(stats.activeDays)} active days`));
  }
  years.forEach((year, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = x0 + col * (blockW + 3 * cell);
    const by = y0 + row * (blockH + 1.5 * cell);
    parts.push(text(bx, by + cell * 2, cell * 1.8, ctx.theme.muted, String(year), { weight: 600 }));
    parts.push(grid(weeksFor(year, ctx.today), bx, by + cell * 3, cell, ctx));
  });
  return parts.join('');
}
