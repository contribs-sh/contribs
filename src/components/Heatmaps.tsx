import { useState } from 'react';
import { useContributions } from '../contributionsContext';
import { recentYears as RECENT_YEARS } from '../config';
import { YearHeatmap } from './YearHeatmap';

/**
 * Renders the selected year's heatmap, or (for the all-years overview) the most
 * recent `recentYears` years, with the rest tucked behind a fade-in toggle.
 */
export function Heatmaps() {
  const { data, scope } = useContributions();
  const [showEarlier, setShowEarlier] = useState(false);

  if (scope !== 'all') {
    const year = data.years.find((y) => y.year === scope);
    return <div className="heatmaps">{year && <YearHeatmap year={year} />}</div>;
  }

  const years = [...data.years].sort((a, b) => b.year - a.year);
  const recent = years.slice(0, RECENT_YEARS);
  const earlier = years.slice(RECENT_YEARS);

  return (
    <div className="heatmaps">
      {recent.map((y) => (
        <YearHeatmap key={y.year} year={y} />
      ))}

      {earlier.length > 0 && !showEarlier && (
        <button className="show-earlier" onClick={() => setShowEarlier(true)}>
          Show {earlier.length} earlier {earlier.length === 1 ? 'year' : 'years'} (
          {earlier[earlier.length - 1].year}–{earlier[0].year})
          <span className="show-earlier__chevron">↓</span>
        </button>
      )}

      {earlier.length > 0 && showEarlier && (
        <div className="heatmaps__earlier">
          {earlier.map((y) => (
            <YearHeatmap key={y.year} year={y} />
          ))}
          <button className="show-earlier" onClick={() => setShowEarlier(false)}>
            Hide earlier years
            <span className="show-earlier__chevron">↑</span>
          </button>
        </div>
      )}
    </div>
  );
}
