import { useState } from 'react';
import type { LostConfig, LostRange } from '../data/lost';
import { slug } from './store';

const SWATCHES = ['#a371f7', '#8e9fbf', '#d29922', '#db6d28', '#3fb950', '#58a6ff'];

/** Edit periods whose history lives on a platform contribs.sh can't read (old SVN, a lost Bitbucket, …). */
export function LostForm({ value, onChange }: { value: LostConfig; onChange: (next: LostConfig) => void }) {
  const [draft, setDraft] = useState<LostRange>(() => blank(value.ranges.length));

  const save = (ranges: LostRange[]) => onChange({ ...value, enabled: ranges.length > 0, ranges });
  const add = () => {
    if (!draft.label || !draft.from || !draft.to || draft.to < draft.from) return;
    let id = slug(draft.label);
    for (let n = 2; value.ranges.some((r) => r.id === id); n++) id = `${slug(draft.label)}-${n}`;
    save([...value.ranges, { ...draft, id, note: draft.note || `${draft.label} (not on any connected forge)` }]);
    setDraft(blank(value.ranges.length + 1));
  };

  return (
    <div className="setup-lost">
      {value.ranges.length > 0 && (
        <ul className="setup-list">
          {value.ranges.map((r) => (
            <li key={r.id} className="setup-list__row">
              <span className="setup-swatch" style={{ background: r.color }} aria-hidden="true" />
              <span className="setup-list__main">
                <strong>{r.label ?? r.id}</strong>
                <span>{r.from} to {r.to} · {r.days === 'weekdays' ? 'weekdays' : 'every day'}</span>
              </span>
              <label className="setup-check setup-check--inline">
                <input
                  type="checkbox"
                  checked={r.enabled !== false}
                  onChange={(e) => save(value.ranges.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))}
                />
                Show
              </label>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => save(value.ranges.filter((x) => x.id !== r.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="setup-more">
        <summary>Add a period</summary>
      <div className="setup-form__grid">
        <label className="setup-field">
          <span>Name</span>
          <input value={draft.label ?? ''} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Old job (SVN)" />
        </label>
        <label className="setup-field"><span>From</span><input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="setup-field"><span>To</span><input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
        <label className="setup-field">
          <span>Days</span>
          <select value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value as LostRange['days'] })}>
            <option value="weekdays">Weekdays</option>
            <option value="all">Every day</option>
          </select>
        </label>
        <fieldset className="setup-field setup-field--wide setup-swatches">
          <legend>Colour</legend>
          {SWATCHES.map((c) => (
            <label key={c} className="setup-swatch-pick" data-active={draft.color === c}>
              <input type="radio" name="lost-colour" value={c} checked={draft.color === c} onChange={() => setDraft({ ...draft, color: c })} />
              <span className="setup-swatch" style={{ background: c }} />
              <span className="sr-only">{c}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="setup-actions">
        <button type="button" className="setup-btn" onClick={add} disabled={!draft.label || !draft.from || !draft.to || draft.to < draft.from}>
          Add period
        </button>
      </div>
      </details>
    </div>
  );
}

function blank(index: number): LostRange {
  return { id: '', label: '', from: '', to: '', days: 'weekdays', color: SWATCHES[index % SWATCHES.length] };
}
