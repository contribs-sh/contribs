/**
 * Lost/incomplete history ranges — pure types and compiler shared by the browser app
 * (`src/lostRanges.ts`) and the Node CLI/renderer (`src/cli`).
 */

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
export const DEFAULT_LOST_COLOR = '#484f58';

export interface LostConfig {
  /** Master switch for the whole overlay. */
  enabled: boolean;
  /** Default hover text for ranges without their own `note`. */
  label: string;
  ranges: LostRange[];
}

export const EMPTY_LOST_CONFIG: LostConfig = { enabled: false, label: '', ranges: [] };

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

/** Drop ranges whose legend button is switched off. */
export function filterLost(config: LostConfig, enabled: Record<string, boolean>): LostConfig {
  return { ...config, ranges: config.ranges.filter((r) => enabled[r.label ?? r.id] !== false) };
}

/** Active ranges, one legend swatch each. */
export function legendOf(config: LostConfig): Array<{ id: string; label: string; color: string }> {
  return config.enabled
    ? config.ranges
        .filter((r) => r.enabled !== false)
        .map((r) => ({ id: r.id, label: r.label ?? r.id, color: r.color ?? DEFAULT_LOST_COLOR }))
    : [];
}
