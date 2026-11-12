import { compileLost, DEFAULT_LOST_COLOR, EMPTY_LOST_CONFIG, type LostConfig } from './data/lost';

export type { LostConfig, LostHit, LostRange } from './data/lost';
export { compileLost } from './data/lost';

// Load the user's gitignored `lost-ranges.json` if present, otherwise fall back to the
// committed `lost-ranges.example.json`, so a fresh clone builds without any setup.
const configModules = import.meta.glob<{ default: LostConfig }>('../lost-ranges*.json', {
  eager: true,
});
const pick = (suffix: string) =>
  Object.entries(configModules).find(([path]) => path.endsWith(suffix))?.[1]?.default;
const config: LostConfig =
  pick('/lost-ranges.json') ?? pick('/lost-ranges.example.json') ?? EMPTY_LOST_CONFIG;

/** The active lost-ranges config (for the export renderer). */
export const lostConfig = config;

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
