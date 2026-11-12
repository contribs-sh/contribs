/** Small fetch helpers shared by the REST adapters (Node CLI and browser). */

/**
 * `User-Agent` for Node only. Browsers set their own, and some forges (Bitbucket) reject it in a
 * CORS preflight.
 */
export function userAgent(): Record<string, string> {
  return 'document' in globalThis ? {} : { 'User-Agent': 'contribs-sh' };
}

/** Base64 for HTTP Basic auth, without Node's Buffer so it also runs in the browser. */
export function basicAuth(user: string, password: string): string {
  return `Basic ${btoa(unescape(encodeURIComponent(`${user}:${password}`)))}`;
}

export async function getJson<T>(url: string, headers: Record<string, string>, label: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...userAgent(), ...headers } });
  if (!res.ok) throw new Error(`${label} ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build a SourceResult-style day map from a list of ISO timestamps or dates. */
export function bucketByDay(stamps: Iterable<string>): Record<string, number> {
  const days: Record<string, number> = {};
  const today = todayISO();
  for (const stamp of stamps) {
    const date = stamp.slice(0, 10);
    if (date > today) continue;
    days[date] = (days[date] ?? 0) + 1;
  }
  return days;
}

export function coverageOf(days: Record<string, number>, from?: string, to?: string): { from: string; to: string } {
  const dates = Object.keys(days).sort();
  const today = todayISO();
  return { from: from ?? dates[0] ?? today, to: to ?? today };
}
