import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { filteredLostFor, type LostHit } from './lostRanges';
import type { SourceResult } from './fetch/adapters/types';
import type { MergedData } from './data/types';
import type { Scope } from './data/stats';

const SHOW_LOST_KEY = 'contribs-sh:showLost';

function initialShowLost(): boolean {
  try {
    const stored = localStorage.getItem(SHOW_LOST_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

interface ContributionsContextValue {
  data: MergedData;
  sourceDetails: Record<string, SourceResult | null | undefined>;
  scope: Scope;
  setScope: (scope: Scope) => void;
  /** Whether lost/incomplete days are shown on the heatmap and counted in stats. */
  showLost: boolean;
  setShowLost: (value: boolean) => void;
  enabledServices: Record<string, boolean>;
  toggleService: (service: string) => void;
  lostFor: (date: string) => LostHit | null;
  today: string;
}

const ContributionsContext = createContext<ContributionsContextValue | null>(null);

export function ContributionsProvider({
  data,
  children,
}: {
  data: MergedData;
  children: ReactNode;
}) {
  const [scope, setScope] = useState<Scope>('all');
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date().toISOString().slice(0, 10)), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [enabledServices, setEnabledServices] = useState<Record<string, boolean>>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('contribs:services') ?? '{}');
      return value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).filter(([, enabled]) => typeof enabled === 'boolean')) : {};
    } catch { return {}; }
  });
  const toggleService = (service: string) => setEnabledServices((current) => {
    const next = { ...current, [service]: current[service] === false };
    try { localStorage.setItem('contribs:services', JSON.stringify(next)); } catch { /* Storage unavailable. */ }
    return next;
  });
  const [sourceDetails, setSourceDetails] = useState<Record<string, SourceResult | null>>({});
  useEffect(() => {
    let cancelled = false;
    setSourceDetails({});
    for (const source of data.sources) {
      fetch(`${import.meta.env.BASE_URL}data/sources/${encodeURIComponent(source.id)}.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<SourceResult>;
        })
        .then((details) => {
          if (!cancelled) setSourceDetails((current) => ({ ...current, [source.id]: details }));
        })
        .catch(() => {
          if (!cancelled) setSourceDetails((current) => ({ ...current, [source.id]: null }));
        });
    }
    return () => { cancelled = true; };
  }, [data]);
  const [showLost, setShowLostState] = useState<boolean>(initialShowLost);
  const lostFor = useMemo(() => {
    const lookup = filteredLostFor(enabledServices);
    return (date: string) => showLost && date <= today ? lookup(date) : null;
  }, [showLost, enabledServices, today]);
  const filteredData = useMemo(() => {
    const fetchedThrough = data.generatedAt.slice(0, 10);
    const normalized = { ...data, sources: data.sources.map((source) => ({
      ...source, coverage: { ...source.coverage, to: source.coverage.to > fetchedThrough ? fetchedThrough : source.coverage.to },
    })) };
    const remaining = data.sources.filter((source) => source.type !== 'github');
    return { ...normalized, years: data.years.map((year) => {
      const weeks = year.weeks.map((week) => ({ days: week.days.map((day) => ({
        ...day,
        known: day.date <= today && normalized.sources.some((source) => day.date >= source.coverage.from && day.date <= source.coverage.to),
        count: day.date > today || day.date > fetchedThrough ? 0 : enabledServices.GitHub !== false ? day.count : remaining.reduce((sum, source) => sum + (sourceDetails[source.id]?.days[day.date] ?? 0), 0),
      })) }));
      return { ...year, weeks, total: weeks.flatMap((week) => week.days).reduce((sum, day) => sum + (day.date.startsWith(`${year.year}-`) ? day.count : 0), 0) };
    }) };
  }, [data, enabledServices, sourceDetails, today]);

  const setShowLost = (value: boolean) => {
    setShowLostState(value);
    try {
      localStorage.setItem(SHOW_LOST_KEY, String(value));
    } catch {
      /* ignore persistence failures */
    }
  };

  return (
    <ContributionsContext.Provider value={{ data: filteredData, sourceDetails, scope, setScope, showLost, setShowLost, enabledServices, toggleService, lostFor, today }}>
      {children}
    </ContributionsContext.Provider>
  );
}

export function useContributions(): ContributionsContextValue {
  const ctx = useContext(ContributionsContext);
  if (!ctx) throw new Error('useContributions must be used within ContributionsProvider');
  return ctx;
}
