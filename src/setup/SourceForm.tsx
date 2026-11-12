import { useId, useState, type FormEvent } from 'react';
import { FORGES, forgeInfo } from './forges';
import { fetchSource } from './fetchInBrowser';
import { slug, tokenFor, type BrowserSource, type BrowserSourceType } from './store';
import type { SourceResult } from '../fetch/adapters/types';

interface Props {
  initial?: BrowserSource;
  existingIds: string[];
  onSave: (source: BrowserSource, result: SourceResult | null) => void;
  onCancel?: () => void;
}

type Test = { state: 'idle' } | { state: 'testing' } | { state: 'ok'; result: SourceResult } | { state: 'error'; message: string };

/** Add or edit one forge account. "Test connection" fetches it once so the user sees real numbers before saving. */
export function SourceForm({ initial, existingIds, onSave, onCancel }: Props) {
  const ids = useId();
  const [type, setType] = useState<BrowserSourceType>(initial?.type ?? 'github');
  const forge = forgeInfo(type) ?? FORGES[0];
  const [host, setHost] = useState(initial?.host ?? forge.defaultHost);
  const [username, setUsername] = useState(initial?.username ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [token, setToken] = useState(initial ? tokenFor(initial) : '');
  const [remember, setRemember] = useState(initial?.rememberToken ?? false);
  const [emails, setEmails] = useState((initial?.emails ?? []).join(', '));
  const [from, setFrom] = useState(initial?.from ?? '');
  const [to, setTo] = useState(initial?.to ?? '');
  const [test, setTest] = useState<Test>({ state: 'idle' });

  const pickType = (next: BrowserSourceType) => {
    setType(next);
    setHost(forgeInfo(next)?.defaultHost ?? '');
    setTest({ state: 'idle' });
  };

  const build = (): BrowserSource => {
    const cleanHost = host.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || forge.defaultHost;
    const name = label.trim() || `${forge.name.split(' ')[0]} (${username.trim()})`;
    let id = initial?.id ?? slug(`${type}-${username || cleanHost}`);
    if (!initial) for (let n = 2; existingIds.includes(id); n++) id = `${slug(`${type}-${username || cleanHost}`)}-${n}`;
    const emailList = emails.split(/[,\s]+/).map((e) => e.trim()).filter(Boolean);
    return {
      id,
      label: name,
      type,
      host: cleanHost,
      username: username.trim(),
      emails: emailList.length ? emailList : undefined,
      from: from || undefined,
      to: to || undefined,
      token: token.trim() || undefined,
      rememberToken: remember,
      enabled: initial?.enabled,
    };
  };

  const runTest = async () => {
    setTest({ state: 'testing' });
    try {
      const result = await fetchSource(build());
      setTest({ state: 'ok', result });
    } catch (err) {
      setTest({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(build(), test.state === 'ok' ? test.result : null);
  };

  const total = test.state === 'ok' ? Object.values(test.result.days).reduce((a, b) => a + b, 0) : 0;

  return (
    <form className="setup-form" onSubmit={submit}>
      <fieldset className="setup-form__forges">
        <legend>Forge</legend>
        {FORGES.map((f) => (
          <label key={f.type} className="setup-chip" data-active={f.type === type}>
            <input type="radio" name={`${ids}-type`} value={f.type} checked={f.type === type} onChange={() => pickType(f.type)} />
            {f.name}
          </label>
        ))}
      </fieldset>

      <div className="setup-form__grid">
        <label className="setup-field">
          <span>Host</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder={forge.defaultHost} spellCheck={false} autoComplete="off" />
          <small>{forge.hostHint}</small>
        </label>
        <label className="setup-field">
          <span>{forge.usernameLabel}</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required spellCheck={false} autoComplete="off" />
        </label>
        <label className="setup-field">
          <span>Label <em>optional</em></span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${forge.name.split(' ')[0]} (${username || 'you'})`} />
          <small>Shown in the legend, e.g. "Work GitHub".</small>
        </label>
        <label className="setup-field setup-field--wide">
          <span>Token {forge.tokenOptional && <em>optional</em>}</span>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required={!forge.tokenOptional} autoComplete="off" spellCheck={false} />
          <small>
            {forge.tokenHelp}{' '}
            <a href={forge.tokenUrl(host || forge.defaultHost)} target="_blank" rel="noreferrer">Create a token</a>
          </small>
        </label>
        {forge.needsEmails && (
          <label className="setup-field setup-field--wide">
            <span>Commit emails <em>optional</em></span>
            <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="you@old-job.example" spellCheck={false} />
            <small>Extra author emails that count as you, comma-separated.</small>
          </label>
        )}
        <details className="setup-field--wide setup-more">
          <summary>Date window (for repos mirrored on two forges)</summary>
          <div className="setup-form__grid">
            <label className="setup-field"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="setup-field"><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <small>Only count this source between these dates, so the same work isn't counted twice.</small>
        </details>
        <label className="setup-check setup-field--wide">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember the token on this device
          <small>Off: the token is used for this session only, and re-fetching later asks for it again.</small>
        </label>
      </div>

      <p className="setup-status" role="status" aria-live="polite">
        {test.state === 'testing' && 'Connecting…'}
        {test.state === 'ok' && `Connected: ${total.toLocaleString()} contributions, ${test.result.coverage.from} to ${test.result.coverage.to}.`}
        {test.state === 'error' && <span className="setup-status--error">{test.message}</span>}
      </p>

      <div className="setup-actions">
        <button type="button" className="setup-btn" onClick={runTest} disabled={!username || test.state === 'testing'}>
          Test connection
        </button>
        <button type="submit" className="setup-btn setup-btn--primary" disabled={!username}>
          {initial ? 'Save changes' : 'Add source'}
        </button>
        {onCancel && <button type="button" className="setup-btn setup-btn--ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
