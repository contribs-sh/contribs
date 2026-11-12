import type { Adapter, ResolvedSource } from './types';
import { userAgent } from './http';

/**
 * Forgejo / Gitea adapter (e.g. Codeberg).
 * Uses the heatmap endpoint, which returns day-bucketed activity:
 *   GET {host}/api/v1/users/{username}/heatmap -> [{ timestamp, contributions }]
 * `timestamp` is unix seconds at the start of a UTC day.
 */
export const forgejoAdapter: Adapter = async (source: ResolvedSource) => {
  const url = `https://${source.host}/api/v1/users/${encodeURIComponent(source.username)}/heatmap`;
  const res = await fetch(url, {
    headers: {
      ...(source.token ? { Authorization: `token ${source.token}` } : {}),
      Accept: 'application/json',
      ...userAgent(),
    },
  });
  if (!res.ok) {
    throw new Error(`Forgejo heatmap ${res.status} for ${source.id}: ${await res.text()}`);
  }

  const entries = (await res.json()) as Array<{ timestamp: number; contributions: number }>;

  const days: Record<string, number> = {};
  for (const { timestamp, contributions } of entries) {
    if (!contributions) continue;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    days[date] = (days[date] ?? 0) + contributions;
  }

  const dates = Object.keys(days).sort();
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: source.id,
    label: source.label,
    type: 'forgejo',
    days,
    // Heatmap only returns active days; the source covers through the present.
    coverage: { from: dates[0] ?? today, to: today },
  };
};
