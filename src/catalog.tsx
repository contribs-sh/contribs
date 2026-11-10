import { defineCatalog } from '@json-render/core';
import { defineRegistry } from '@json-render/react';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

import { Dashboard } from './components/Dashboard';
import { SourceLegend } from './components/SourceLegend';
import { YearSelector } from './components/YearSelector';
import { StatsPanel } from './components/StatsPanel';
import { Heatmaps } from './components/Heatmaps';

/**
 * The catalog declares the components the JSON document (dashboard.json) may use.
 * Heavy contribution data is not threaded through props — components read it from
 * ContributionsContext — so props here are limited to layout-level configuration.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Dashboard: {
      props: z.object({}),
      description: 'Page shell with title and header',
    },
    SourceLegend: {
      props: z.object({}),
      description: 'Source list and contribution intensity scale',
    },
    YearSelector: {
      props: z.object({}),
      description: 'Tabs to switch between all years and a single year',
    },
    StatsPanel: {
      props: z.object({}),
      description: 'Summary statistics for the selected scope',
    },
    Heatmaps: {
      props: z.object({}),
      description: 'Contribution heatmap grid(s) for the selected scope',
    },
  },
  actions: {},
});

export const { registry } = defineRegistry(catalog, {
  components: {
    Dashboard: ({ children }) => <Dashboard>{children}</Dashboard>,
    SourceLegend: () => <SourceLegend />,
    YearSelector: () => <YearSelector />,
    StatsPanel: () => <StatsPanel />,
    Heatmaps: () => <Heatmaps />,
  },
  actions: {},
});
