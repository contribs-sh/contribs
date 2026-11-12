import { useRef, useState, type ChangeEvent } from 'react';
import { SourceForm } from './SourceForm';
import { LostForm } from './LostForm';
import { forgeInfo } from './forges';
import { fetchAll, parseImport } from './fetchInBrowser';
import {
  clearEverything,
  exportWorkspace,
  parseWorkspace,
  slug,
  tokenFor,
  type BrowserSource,
  type Fetched,
  type Workspace,
} from './store';
import type { SourceResult } from '../fetch/adapters/types';

interface Props {
  workspace: Workspace;
  fetched: Fetched | null;
  onChange: (ws: Workspace) => void;
  onFetched: (f: Fetched) => void;
  /** Present when there is a dashboard to go back to. */
  onClose?: () => void;
  onReset: () => void;
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * First-run and settings screen for the hosted site. Everything stays in this browser:
 * sources and lost history in localStorage, tokens in memory unless remembered.
 */
export function SetupScreen({ workspace, fetched, onChange, onFetched, onClose, onReset }: Props) {
  const [editing, setEditing] = useState<string | 'new' | null>(workspace.sources.length === 0 ? 'new' : null);
  const [imported, setImported] = useState<Record<string, SourceResult>>({});
  const [progress, setProgress] = useState<Record<string, 'start' | 'done' | 'error'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const importFile = useRef<HTMLInputElement>(null);
  const setupFile = useRef<HTMLInputElement>(null);

  const sources = workspace.sources;
  const missingToken = sources.filter((s) => s.enabled !== false && s.type !== 'json' && !forgeInfo(s.type)?.tokenOptional && !tokenFor(s));

  const saveSource = (source: BrowserSource, result: SourceResult | null) => {
    const exists = sources.some((s) => s.id === source.id);
    onChange({ ...workspace, sources: exists ? sources.map((s) => (s.id === source.id ? source : s)) : [...sources, source] });
    if (result) setImported((m) => ({ ...m, [source.id]: result }));
    setEditing(null);
  };

  const removeSource = (id: string) => onChange({ ...workspace, sources: sources.filter((s) => s.id !== id) });

  const run = async () => {
    setBusy(true);
    setErrors({});
    setProgress({});
    const report = await fetchAll(sources, fetched, imported, (id, state) => setProgress((p) => ({ ...p, [id]: state })));
    setBusy(false);
    setErrors(report.errors);
    if (report.fetched.merged.sources.length === 0) {
      setNotice('Nothing to show yet: add at least one source that connects.');
      return;
    }
    onFetched(report.fetched);
  };

  const onImportData = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const label = file.name.replace(/\.json$/i, '');
      let id = slug(`import-${label}`);
      for (let n = 2; sources.some((s) => s.id === id); n++) id = `${slug(`import-${label}`)}-${n}`;
      const result = parseImport(await file.text(), id, label);
      setImported((m) => ({ ...m, [id]: result }));
      onChange({ ...workspace, sources: [...sources, { id, label, type: 'json', host: '', username: '' }] });
      setNotice(`Imported ${Object.keys(result.days).length.toLocaleString()} days from ${file.name}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const onLoadSetup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = parseWorkspace(await file.text());
      onChange({ ...workspace, sources: next.sources.length ? next.sources : sources, lost: next.lost.ranges.length ? next.lost : workspace.lost });
      setNotice(`Loaded ${next.sources.length} source(s) and ${next.lost.ranges.length} lost period(s). Add tokens, then fetch.`);
    } catch {
      setNotice("That file isn't a contribs.sh setup, sources.json, or lost-ranges.json.");
    }
  };

  return (
    <main className="setup">
      <header className="setup__head">
        <div>
          <h1 className="setup__title">{fetched ? 'Your sources' : 'Set up contribs.sh'}</h1>
          <p className="setup__lede">
            Connect every account you've written code on. Everything stays in this browser: contribs.sh has no server
            and never sees your tokens.
          </p>
        </div>
        {onClose && <button type="button" className="setup-btn setup-btn--ghost" onClick={onClose}>Back to dashboard</button>}
      </header>

      <section className="setup-section" aria-labelledby="sources-h">
        <h2 id="sources-h" className="setup-section__title">Accounts</h2>
        {sources.length > 0 && (
          <ul className="setup-list">
            {sources.map((s) =>
              editing === s.id ? (
                <li key={s.id} className="setup-list__edit">
                  <SourceForm initial={s} existingIds={sources.map((x) => x.id)} onSave={saveSource} onCancel={() => setEditing(null)} />
                </li>
              ) : (
                <li key={s.id} className="setup-list__row">
                  <span className={`legend__dot legend__dot--${s.type}`} aria-hidden="true" />
                  <span className="setup-list__main">
                    <strong>{s.label}</strong>
                    <span>
                      {s.type === 'json' ? 'Imported file' : `${forgeInfo(s.type)?.name ?? s.type} · ${s.host}${s.username ? ` · ${s.username}` : ''}`}
                      {(s.from || s.to) && ` · ${s.from ?? '…'} to ${s.to ?? '…'}`}
                    </span>
                    {errors[s.id] && <span className="setup-status--error">{errors[s.id]}</span>}
                  </span>
                  <span className="setup-list__state" aria-live="polite">
                    {progress[s.id] === 'start' && 'Fetching…'}
                    {progress[s.id] === 'done' && 'Updated'}
                    {!progress[s.id] && s.type !== 'json' && !tokenFor(s) && !forgeInfo(s.type)?.tokenOptional && 'Needs token'}
                  </span>
                  {s.type !== 'json' && <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setEditing(s.id)}>Edit</button>}
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => removeSource(s.id)}>Remove</button>
                </li>
              ),
            )}
          </ul>
        )}
        {editing === 'new' ? (
          <div className="setup-card">
            <SourceForm existingIds={sources.map((x) => x.id)} onSave={saveSource} onCancel={sources.length ? () => setEditing(null) : undefined} />
          </div>
        ) : (
          <div className="setup-actions">
            <button type="button" className="setup-btn" onClick={() => setEditing('new')}>Add account</button>
            <button type="button" className="setup-btn" onClick={() => importFile.current?.click()}>Import data file</button>
            <input ref={importFile} type="file" accept="application/json,.json" hidden onChange={onImportData} />
          </div>
        )}
        <p className="setup-hint">
          Azure DevOps, self-hosted forges behind a VPN, and repos on your disk need the CLI:{' '}
          <code>npx contribs.sh scan ~/code --email you@old-job.example</code> prints data you can import here.
        </p>
      </section>

      <section className="setup-section" aria-labelledby="lost-h">
        <h2 id="lost-h" className="setup-section__title">History that isn't on any forge</h2>
        <p className="setup-hint">Mark periods whose work lived somewhere contribs.sh can't read. They show in their own colour, separate from real activity.</p>
        <LostForm value={workspace.lost} onChange={(lost) => onChange({ ...workspace, lost })} />
      </section>

      <section className="setup-section setup-section--go">
        {missingToken.length > 0 && (
          <p className="setup-hint">
            {missingToken.map((s) => s.label).join(', ')} {missingToken.length === 1 ? 'needs' : 'need'} a token this session
            (edit to add it). {fetched ? 'Their last fetched data is kept.' : ''}
          </p>
        )}
        {notice && <p className="setup-status" role="status">{notice}</p>}
        <div className="setup-actions">
          <button type="button" className="setup-btn setup-btn--primary" onClick={run} disabled={busy || sources.length === 0}>
            {busy ? 'Fetching…' : fetched ? 'Re-fetch and show dashboard' : 'Build my heatmap'}
          </button>
        </div>
      </section>

      <section className="setup-section setup-section--quiet" aria-labelledby="manage-h">
        <h2 id="manage-h" className="setup-section__title">Your setup file</h2>
        <p className="setup-hint">
          Save your sources and lost history to move them to another browser, or to self-host with the CLI and
          GitHub Actions. Tokens are never included.
        </p>
        <div className="setup-actions">
          <button type="button" className="setup-btn" onClick={() => download(exportWorkspace(workspace), 'contribs-setup.json')}>Download setup</button>
          <button type="button" className="setup-btn" onClick={() => setupFile.current?.click()}>Load setup</button>
          <input ref={setupFile} type="file" accept="application/json,.json" hidden onChange={onLoadSetup} />
          <button
            type="button"
            className="setup-btn setup-btn--danger"
            onClick={() => {
              if (window.confirm('Remove all sources, lost history and fetched data from this browser?')) {
                clearEverything();
                onReset();
              }
            }}
          >
            Clear everything
          </button>
        </div>
      </section>
    </main>
  );
}
