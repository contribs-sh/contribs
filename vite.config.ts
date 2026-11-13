import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Lost-range ids in `lost-ranges.json` are config handles that often name an employer
 * ("acme-bitbucket"). The page never shows them, so replace them before the file is bundled.
 */
function stripLostRangeIds(): Plugin {
  return {
    name: 'contribs-strip-lost-range-ids',
    enforce: 'pre',
    transform(code, id) {
      if (!/lost-ranges(\.example)?\.json$/.test(id)) return null;
      const config = JSON.parse(code) as { ranges?: Array<{ id?: string }> };
      config.ranges = (config.ranges ?? []).map((r, i) => ({ ...r, id: `range-${i + 1}` }));
      return { code: JSON.stringify(config), map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripLostRangeIds(), react()],
});
