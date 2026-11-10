import { useMemo } from 'react';
import { useContributions } from '../contributionsContext';
import { computeStats } from '../data/stats';

/** Dropdown to switch between an all-years overview and a single year. */
export function YearSelector() {
  const { data, scope, setScope, showLost, lostFor } = useContributions();
  const years = [...data.years].sort((a, b) => b.year - a.year);

  // Per-year totals — including lost/incomplete days when that overlay is enabled,
  // so the dropdown matches the stat cards.
  const totals = useMemo(() => {
    const isLost = showLost ? (d: string) => lostFor(d) !== null : undefined;
    const map = new Map<number, number>();
    for (const y of data.years) {
      map.set(y.year, computeStats(data.years, y.year, isLost).total);
    }
    return map;
  }, [data.years, showLost, lostFor]);

  return (
    <div className="years">
      <label className="years__label" htmlFor="year-filter">
        Show
      </label>
      <div className="years__select-wrap">
        <select
          id="year-filter"
          className="years__select"
          value={String(scope)}
          onChange={(e) => setScope(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y.year} value={y.year}>
              {y.year} · {(totals.get(y.year) ?? y.total).toLocaleString()} contributions
            </option>
          ))}
        </select>
        <svg className="years__chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
