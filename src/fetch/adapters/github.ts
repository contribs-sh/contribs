import type { Adapter, ResolvedSource, SourceResult } from './types';
import { userAgent } from './http';

/**
 * GitHub adapter — works for github.com and GitHub Enterprise (any host).
 * Mirrors the original zsh function: query the account's contribution years,
 * then fetch each year's contribution calendar. A single viewer query already
 * aggregates that account's org/private contributions (token needs repo + read:org).
 */
export const githubAdapter: Adapter = async (source) => {
  const fetchedThrough = todayISO();
  const years = await fetchContributionYears(source);

  const days: Record<string, number> = {};
  // Coverage tracks every reported day (including zeros) so genuine zero-activity
  // days are never mistaken for missing history.
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const year of years) {
    const calendar = await fetchYearCalendar(source, year);
    for (const week of calendar) {
      for (const day of week) {
        if (day.date > fetchedThrough) continue;
        if (day.contributionCount > 0) days[day.date] = day.contributionCount;
        if (minDate === null || day.date < minDate) minDate = day.date;
        if (maxDate === null || day.date > maxDate) maxDate = day.date;
      }
    }
  }

  const result: SourceResult = {
    id: source.id,
    label: source.label,
    type: 'github',
    days,
    coverage: { from: minDate ?? todayISO(), to: maxDate ?? todayISO() },
  };
  return result;
};

function graphqlEndpoint(host: string): string {
  return host === 'github.com'
    ? 'https://api.github.com/graphql'
    : `https://${host}/api/graphql`;
}

async function graphql<T>(
  source: ResolvedSource,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(graphqlEndpoint(source.host), {
    method: 'POST',
    headers: {
      Authorization: `bearer ${source.token}`,
      'Content-Type': 'application/json',
      ...userAgent(),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status} for ${source.id}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL errors for ${source.id}: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) throw new Error(`GitHub GraphQL returned no data for ${source.id}`);
  return json.data;
}

async function fetchContributionYears(source: ResolvedSource): Promise<number[]> {
  const data = await graphql<{ viewer: { contributionsCollection: { contributionYears: number[] } } }>(
    source,
    `{ viewer { contributionsCollection { contributionYears } } }`,
    {},
  );
  return data.viewer.contributionsCollection.contributionYears;
}

interface CalendarDay {
  date: string;
  contributionCount: number;
}

async function fetchYearCalendar(source: ResolvedSource, year: number): Promise<CalendarDay[][]> {
  const data = await graphql<{
    viewer: {
      contributionsCollection: {
        contributionCalendar: { weeks: Array<{ contributionDays: CalendarDay[] }> };
      };
    };
  }>(
    source,
    `query($from: DateTime!, $to: DateTime!) {
      viewer {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }`,
    { from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
  );
  return data.viewer.contributionsCollection.contributionCalendar.weeks.map((w) => w.contributionDays);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
