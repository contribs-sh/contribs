import { useMemo, useState } from 'react';
import { useContributions } from '../contributionsContext';
import { PRESETS, PRESET_IDS, renderSvg, type PresetId, type Range, type ThemeId } from '../render/svg';

// Safari refuses canvases above ~16.7M pixels; larger exports are scaled to fit.
const MAX_CANVAS_PIXELS = 16_000_000;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function svgToPng(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  const fit = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * fit);
    canvas.height = Math.round(height * fit);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Collapsible panel that renders the current data as a banner, card, Wrapped story, or poster. */
export function ExportPanel() {
  const { data, lostFor, today } = useContributions();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetId>('x');
  const [range, setRange] = useState<string>('default');
  const [theme, setTheme] = useState<ThemeId>('dark');
  const [stats, setStats] = useState(true);
  const [mark, setMark] = useState(true);
  const [transparent, setTransparent] = useState(false);
  const [title, setTitle] = useState('');
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);

  const years = useMemo(() => data.years.map((y) => y.year).sort((a, b) => b - a), [data.years]);
  const resolvedRange: Range | undefined = range === 'default' ? undefined : range === 'rolling' || range === 'all' ? range : Number(range);
  const svg = useMemo(
    () => (open ? renderSvg(data, { preset, range: resolvedRange, theme, stats, mark, transparent, title: title || undefined, lostFor, today }) : ''),
    [open, data, preset, resolvedRange, theme, stats, mark, transparent, title, lostFor, today],
  );
  const { width, height } = PRESETS[preset];
  const base = `contribs-${preset}-${range === 'default' ? 'auto' : range}`;

  const savePng = async () => {
    setBusy(true);
    try {
      download(await svgToPng(svg, width, height, scale), `${base}${scale > 1 ? `@${scale}x` : ''}.png`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="export">
      <button type="button" className="export__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide export' : 'Export image'}
      </button>
      {open && (
        <div className="export__body">
          <div className="export__controls">
            <label>
              Format
              <select value={preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
                {PRESET_IDS.map((id) => <option key={id} value={id}>{PRESETS[id].label}</option>)}
              </select>
            </label>
            <label>
              Range
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="default">Default for format</option>
                <option value="rolling">Last 12 months</option>
                {preset === 'poster' && <option value="all">All years</option>}
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>
              Theme
              <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label>
              Title
              <input type="text" value={title} placeholder="optional" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              PNG scale
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </label>
            <label className="export__check"><input type="checkbox" checked={stats} onChange={(e) => setStats(e.target.checked)} /> Stats</label>
            <label className="export__check"><input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} /> contribs.sh mark</label>
            <label className="export__check"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent</label>
          </div>
          <div className="export__preview" style={{ aspectRatio: `${width} / ${height}` }}>
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`${PRESETS[preset].label} preview`} />
          </div>
          <div className="export__actions">
            <button type="button" onClick={savePng} disabled={busy}>{busy ? 'Rendering…' : 'Download PNG'}</button>
            <button type="button" onClick={() => download(new Blob([svg], { type: 'image/svg+xml' }), `${base}.svg`)}>Download SVG</button>
            {preset === 'poster' && <span className="export__hint">Full 300 dpi PNG: <code>npm run banner -- --preset poster</code></span>}
          </div>
        </div>
      )}
    </section>
  );
}
