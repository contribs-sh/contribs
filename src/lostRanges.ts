// Load the user's gitignored `lost-ranges.json` if present, otherwise fall back to the
// committed `lost-ranges.example.json`, so a fresh clone builds without any setup.
const configModules = import.meta.glob<{ default: LostConfig }>('../lost-ranges*.json', {
  eager: true,
});
const pick = (suffix: string) =>
  Object.entries(configModules).find(([path]) => path.endsWith(suffix))?.[1]?.default;
const rawConfig: LostConfig =
  pick('/lost-ranges.json') ?? pick('/lost-ranges.example.json') ?? {
    enabled: false,
    label: '',
    ranges: [],
  };

/** One configured "lost data" window. */
export interface LostRange {
  id: string;
  /** Short name shown in the legend; falls back to `id`. */
  label?: string;
  /** Inclusive ISO date `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Which weekdays in the window to mark. */
  days: 'weekdays' | 'all' | 'selective';
  /** Weekday numbers (0=Sun…6=Sat) used when `days` is `selective`. */
  weekdays?: number[];
  /** Hover text; falls back to the top-level `label`. */
  note?: string;
  /** Cell color for this range's lost days; falls back to a neutral gray. */
  color?: string;
  /** Set false (or delete the entry) to drop this range. Defaults to enabled. */
  enabled?: boolean;
}

/** What a lost day resolves to: its hover note and cell color. */
export interface LostHit {
  note: string;
  color: string;
}

/** A neutral gray for ranges that don't set their own `color`. */
const DEFAULT_LOST_COLOR = '#484f58';

export interface LostConfig {
  /** Master switch for the whole overlay. */
  enabled: boolean;
  /** Default hover text for ranges without their own `note`. */
  label: string;
  ranges: LostRange[];
}

const WEEKDAY_PRESETS: Record<'weekdays' | 'all', number[]> = {
  weekdays: [1, 2, 3, 4, 5],
  all: [0, 1, 2, 3, 4, 5, 6],
};

interface CompiledRange {
  from: number;
  to: number;
  dows: Set<number>;
  hit: LostHit;
}

function parseUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Compile the config into a fast lookup: given an ISO date, return the lost-day
 * hit (note + color) if it falls in an enabled range on a matching weekday, else null.
 */
export function compileLost(config: LostConfig): (dateISO: string) => LostHit | null {
  if (!config.enabled) return () => null;

  const compiled: CompiledRange[] = config.ranges
    .filter((r) => r.enabled !== false)
    .map((r) => ({
      from: parseUTC(r.from),
      to: parseUTC(r.to),
      dows: new Set(r.days === 'selective' ? r.weekdays ?? [] : WEEKDAY_PRESETS[r.days]),
      hit: { note: r.note ?? config.label, color: r.color ?? DEFAULT_LOST_COLOR },
    }));

  if (compiled.length === 0) return () => null;

  return (dateISO: string) => {
    const ms = parseUTC(dateISO);
    const dow = new Date(ms).getUTCDay();
    for (const c of compiled) {
      if (ms >= c.from && ms <= c.to && c.dows.has(dow)) return c.hit;
    }
    return null;
  };
}

const config = rawConfig as LostConfig;

/** Returns the lost-day hit (note + color) for a date, or null. */
export const lostFor = compileLost(config);
export function filteredLostFor(enabled: Record<string, boolean>) {
  return compileLost({ ...config, ranges: config.ranges.filter((range) => enabled[range.label ?? range.id] !== false) });
}

/** Active ranges, for the legend (one swatch each). */
export const lostLegend: Array<{ id: string; label: string; color: string }> = config.enabled
  ? config.ranges
      .filter((r) => r.enabled !== false)
      .map((r) => ({ id: r.id, label: r.label ?? r.id, color: r.color ?? DEFAULT_LOST_COLOR }))
  : [];

/** Whether any lost range is active. */
export const hasLostRanges = lostLegend.length > 0;
