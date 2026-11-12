import { useContributions } from '../contributionsContext';

/** Lists the merged sources and the intensity scale, including the distinct "no data" swatch. */
export function SourceLegend() {
  const { data, showLost, setShowLost, enabledServices, toggleService, lostLegend } = useContributions();
  // GitHub first (when a GitHub source exists), then each lost range in config order.
  const hasGitHub = data.sources.some((s) => s.type === 'github') || lostLegend.some((item) => item.label === 'GitHub');
  const services = [
    ...(hasGitHub ? [{ label: 'GitHub', color: lostLegend.find((item) => item.label === 'GitHub')?.color ?? '#39d353' }] : []),
    ...lostLegend.filter((item) => item.label !== 'GitHub'),
  ];

  return (
    <>
      <div className="legend__sources">
        {data.sources.map((s) => (
          <span className="legend__source" key={s.id} title={`${s.coverage.from} → ${s.coverage.to}`}>
            <span className={`legend__dot legend__dot--${s.type}`} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="legend legend--sticky">
      <div className="legend__scale">
        {services.map((service) => (
          <label
            className="legend__service"
            key={service.label}
            data-enabled={enabledServices[service.label] !== false}
            style={{ '--service-color': service.color } as import('react').CSSProperties}
            title={`Show or hide ${service.label} history`}
          >
            <input
              type="checkbox"
              checked={enabledServices[service.label] !== false}
              onChange={() => toggleService(service.label)}
            />
            {service.label}
          </label>
        ))}
        {lostLegend.length > 0 && (
          <label
            className="legend__toggle"
            title="Show lost/incomplete days and count them toward total, active days, and average"
          >
            <input
              type="checkbox"
              checked={showLost}
              onChange={(e) => setShowLost(e.target.checked)}
            />
            Lost / Incomplete
          </label>
        )}
        <span className="legend__nodata">
          <span className="cell cell--nodata" /> No Data
        </span>
        <span className="legend__ramp">
          Less
          <span className="cell cell--l0" />
          <span className="cell cell--l1" />
          <span className="cell cell--l2" />
          <span className="cell cell--l3" />
          <span className="cell cell--l4" />
          More
        </span>
      </div>
      </div>
    </>
  );
}
