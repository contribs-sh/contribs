import type { Day, YearCalendar } from '../data/types';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LostHit } from '../data/lost';
import { computeStats } from '../data/stats';
import { useContributions } from '../contributionsContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Map a contribution count to a 0–4 intensity level (GitHub-style ramp). */
function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

// `hit` is the lost-day info (note + color), or null. Green days (count > 0)
// are never lost, so callers pass null for them.
function cellTitle(day: Day, hit: LostHit | null, today: string): string {
  if (day.date > today) return `Future date · ${day.date}`;
  if (day.count > 0) {
    const noun = day.count === 1 ? 'contribution' : 'contributions';
    return `${day.count} ${noun} · ${day.date}`;
  }
  if (hit) return `${hit.note} · ${day.date}`;
  if (!day.known) return `No data · ${day.date}`;
  return `No contributions · ${day.date}`;
}

function cellClass(day: Day, year: number, hit: LostHit | null, today: string): string {
  const classes = ['cell'];
  if (Number(day.date.slice(0, 4)) !== year) classes.push('cell--pad');
  if (day.date > today) classes.push('cell--future');
  else if (day.count > 0) classes.push(`cell--l${level(day.count)}`);
  else if (hit) classes.push('cell--lost');
  else if (!day.known) classes.push('cell--nodata');
  else classes.push('cell--l0');
  return classes.join(' ');
}

/** Month labels aligned to the week column where each month first appears. */
function monthLabels(year: YearCalendar): Array<{ col: number; label: string }> {
  const labels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  year.weeks.forEach((week, col) => {
    const firstInYear = week.days.find((d) => Number(d.date.slice(0, 4)) === year.year);
    if (!firstInYear) return;
    const month = Number(firstInYear.date.slice(5, 7)) - 1;
    if (month !== lastMonth) {
      labels.push({ col, label: MONTHS[month] });
      lastMonth = month;
    }
  });
  return labels;
}

export function YearHeatmap({ year }: { year: YearCalendar }) {
  const { showLost, data, sourceDetails, enabledServices, lostFor, today } = useContributions();
  const tooltipId = useId();
  const [active, setActive] = useState<{ day: Day; x: number; y: number } | null>(null);
  const [focusedDate, setFocusedDate] = useState(`${year.year}-01-01`);
  useEffect(() => {
    const dismiss = () => setActive(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('scroll', dismiss, { capture: true, passive: true });
    window.addEventListener('resize', dismiss);
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  const showDetails = (day: Day, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setActive({ day, x: Math.max(12, Math.min(rect.left, window.innerWidth - 292)), y: rect.top });
  };
  const activeHit = active && showLost && active.day.count === 0 ? lostFor(active.day.date) : null;
  const labels = monthLabels(year);

  return (
    <section className="heatmap">
      <header className="heatmap__head">
        <h3 className="heatmap__year">{year.year}</h3>
        <span className="heatmap__total">{computeStats([year], year.year, (date) => lostFor(date) !== null).total.toLocaleString()} contributions</span>
      </header>

      <div className="heatmap__grid-wrap">
        <div className="heatmap__weekdays">
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>

        <div className="heatmap__cols">
          <div className="heatmap__months">
            {labels.map(({ col, label }) => (
              <span key={`${label}-${col}`} style={{ gridColumn: col + 1 }}>
                {label}
              </span>
            ))}
          </div>

          <div className="heatmap__grid">
            {year.weeks.map((week, col) => (
              <div className="heatmap__week" key={col}>
                {week.days.map((day) => {
                  const hit = showLost && day.count === 0 ? lostFor(day.date) : null;
                  return (
                    <button
                      type="button"
                      key={day.date}
                       className={`${cellClass(day, year.year, hit, today)} heatmap__day`}
                      disabled={Number(day.date.slice(0, 4)) !== year.year}
                      tabIndex={day.date === focusedDate ? 0 : -1}
                      data-date={day.date}
                      aria-label={cellTitle(day, hit, today)}
                      aria-describedby={active?.day.date === day.date ? tooltipId : undefined}
                      onPointerEnter={(event) => { if (event.pointerType === 'mouse') showDetails(day, event.currentTarget); }}
                      onPointerLeave={() => setActive(null)}
                      onFocus={(event) => showDetails(day, event.currentTarget)}
                      onBlur={() => setActive(null)}
                      onClick={(event) => showDetails(day, event.currentTarget)}
                      onKeyDown={(event) => {
                        const offset = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
                        if (offset === undefined) return;
                        event.preventDefault();
                        const date = new Date(`${day.date}T00:00:00Z`);
                        date.setUTCDate(date.getUTCDate() + offset);
                        const next = date.toISOString().slice(0, 10);
                        if (Number(next.slice(0, 4)) !== year.year) return;
                        setFocusedDate(next);
                        event.currentTarget.closest('.heatmap__grid')?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
                      }}
                      style={hit ? { background: hit.color } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {active && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          className={`day-tooltip${active.y < 200 ? ' day-tooltip--below' : ''}`}
          style={{ left: active.x, top: active.y < 200 ? active.y + 22 : active.y - 10 }}
        >
          <strong>{active.day.date}</strong>
          <div className="day-tooltip__summary">{active.day.date > today ? 'Future date' : activeHit ? activeHit.note : active.day.count > 0 ? `${active.day.count} ${active.day.count === 1 ? 'contribution' : 'contributions'}` : active.day.known ? 'No contributions' : 'No data'}</div>
          {enabledServices.GitHub === false && <div className="day-tooltip__note">GitHub history hidden by filter.</div>}
          {activeHit && <div className="day-tooltip__note">Annotated lost history, not recorded activity.</div>}
          {data.sources.map((source) => {
            if (active.day.date > today) return null;
            if (source.type === 'github' && enabledServices.GitHub === false) return null;
            const covered = active.day.date >= source.coverage.from && active.day.date <= source.coverage.to;
            const details = sourceDetails[source.id];
            const value = !covered ? 'No data' : details === undefined ? 'Loading…' : details === null ? 'Details unavailable' : (details.days[active.day.date] ?? 0).toLocaleString();
            return <div className="day-tooltip__source" key={source.id}><span>{source.label}</span><span>{value}</span></div>;
          })}
        </div>, document.body,
      )}
    </section>
  );
}
