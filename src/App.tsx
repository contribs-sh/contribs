import { useEffect, useState, type ComponentProps } from 'react';
import { Renderer, JSONUIProvider } from '@json-render/react';
import { ContributionsProvider } from './contributionsContext';
import { registry } from './catalog';
import type { MergedData } from './data/types';
import specJson from './dashboard.json';
import { SetupScreen } from './setup/SetupScreen';
import { emptyWorkspace, loadFetched, loadWorkspace, saveFetched, saveWorkspace, type Fetched, type Workspace } from './setup/store';
import { SetupContext } from './setup/context';

// The imported JSON is structurally the renderer spec; assert the precise type.
const spec = specJson as ComponentProps<typeof Renderer>['spec'];

type Mode =
  | { kind: 'loading' }
  | { kind: 'file'; data: MergedData }
  | { kind: 'browser' };

/**
 * Two ways to get data:
 *  - file: a built `data/contributions.json` (CLI `fetch`, self-hosted GitHub Actions)
 *  - browser: no data file, so the site runs the in-browser setup and keeps everything locally
 */
export function App() {
  const [mode, setMode] = useState<Mode>({ kind: 'loading' });
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace() ?? emptyWorkspace());
  const [fetched, setFetched] = useState<Fetched | null>(() => loadFetched());
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/contributions.json`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('json') ? (res.json() as Promise<MergedData>) : null))
      .then((data) => setMode(data?.years ? { kind: 'file', data } : { kind: 'browser' }))
      .catch(() => setMode({ kind: 'browser' }));
  }, []);

  const changeWorkspace = (ws: Workspace) => {
    setWorkspace(ws);
    saveWorkspace(ws);
  };
  const changeFetched = (f: Fetched) => {
    setFetched(f);
    saveFetched(f);
    setSetupOpen(false);
  };

  if (mode.kind === 'loading') return <div className="state">Loading…</div>;

  const dashboard = (data: MergedData, details?: Fetched['details']) => (
    <ContributionsProvider data={data} details={details} lost={mode.kind === 'browser' ? workspace.lost : undefined}>
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>
    </ContributionsProvider>
  );

  if (mode.kind === 'file') return dashboard(mode.data);

  if (!fetched || setupOpen) {
    return (
      <SetupScreen
        workspace={workspace}
        fetched={fetched}
        onChange={changeWorkspace}
        onFetched={changeFetched}
        onClose={fetched ? () => setSetupOpen(false) : undefined}
        onReset={() => {
          setWorkspace(emptyWorkspace());
          setFetched(null);
          setSetupOpen(false);
        }}
      />
    );
  }

  return (
    <SetupContext.Provider value={{ openSetup: () => setSetupOpen(true) }}>
      {dashboard(fetched.merged, fetched.details)}
    </SetupContext.Provider>
  );
}
