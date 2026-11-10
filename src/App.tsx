import { useEffect, useState, type ComponentProps } from 'react';
import { Renderer, JSONUIProvider } from '@json-render/react';
import { ContributionsProvider } from './contributionsContext';
import { registry } from './catalog';
import type { MergedData } from './data/types';
import specJson from './dashboard.json';

// The imported JSON is structurally the renderer spec; assert the precise type.
const spec = specJson as ComponentProps<typeof Renderer>['spec'];

export function App() {
  const [data, setData] = useState<MergedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/contributions.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<MergedData>;
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="state state--error">
        Failed to load contribution data: {error}.
        <br />
        Run <code>npm run fetch</code> to generate <code>public/data/contributions.json</code>.
      </div>
    );
  }

  if (!data) return <div className="state">Loading…</div>;

  return (
    <ContributionsProvider data={data}>
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>
    </ContributionsProvider>
  );
}
