import type { ReactNode } from 'react';
import { useContributions } from '../contributionsContext';
import { title } from '../config';
import { useSetup } from '../setup/context';

/** Page shell: title, generated-at note, and the json-render children. */
export function Dashboard({ children }: { children: ReactNode }) {
  const { data } = useContributions();
  const setup = useSetup();
  const generated = new Date(data.generatedAt).toLocaleString();

  return (
    <main className="dashboard">
      <header className="dashboard__head">
        <div className="dashboard__titlebar">
          <h1 className="dashboard__title">{title}</h1>
          {setup && (
            <button type="button" className="setup-btn" onClick={setup.openSetup}>
              Sources and settings
            </button>
          )}
        </div>
        <p className="dashboard__sub">
          Merged from {data.sources.length} source{data.sources.length === 1 ? '' : 's'} ·
          updated {generated}
        </p>
      </header>
      {children}
    </main>
  );
}
