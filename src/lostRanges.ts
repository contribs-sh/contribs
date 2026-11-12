import { EMPTY_LOST_CONFIG, type LostConfig } from './data/lost';

// Load the user's gitignored `lost-ranges.json` if present, otherwise fall back to the
// committed `lost-ranges.example.json`, so a fresh clone builds without any setup.
const configModules = import.meta.glob<{ default: LostConfig }>('../lost-ranges*.json', {
  eager: true,
});
const pick = (suffix: string) =>
  Object.entries(configModules).find(([path]) => path.endsWith(suffix))?.[1]?.default;

/** Lost ranges from the repo's `lost-ranges.json` (self-hosted builds). */
export const lostConfig: LostConfig =
  pick('/lost-ranges.json') ?? pick('/lost-ranges.example.json') ?? EMPTY_LOST_CONFIG;
