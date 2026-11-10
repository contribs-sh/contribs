import { useMemo } from 'react';
import { useContributions } from '../contributionsContext';
import { computeStats } from '../data/stats';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

/** Summary stats for the current scope. Lost-history days are excluded from every metric. */
export function StatsPanel() {
  const { data, scope, showLost, lostFor } = useContributions();
  const stats = useMemo(
    () => computeStats(data.years, scope, showLost ? (d) => lostFor(d) !== null : undefined),
    [data.years, scope, showLost, lostFor],
  );

  const lostHint = stats.lostDays > 0 ? `incl. ${stats.lostDays.toLocaleString()} lost` : undefined;

  return (
    <div className="stats">
      <Stat label="Total contributions" value={stats.total.toLocaleString()} hint={lostHint} />
      <Stat label="Active days" value={stats.activeDays.toLocaleString()} hint={lostHint} />
      <Stat
        label="Busiest day"
        value={stats.busiest ? String(stats.busiest.count) : '—'}
        hint={stats.busiest?.date}
      />
      <Stat label="Longest streak" value={`${stats.longestStreak} d`} hint="real activity only" />
      <Stat label="Current streak" value={`${stats.currentStreak} d`} hint="real activity only" />
      <Stat label="Avg / active day" value={stats.avgPerActiveDay.toFixed(1)} hint={lostHint} />
    </div>
  );
}
