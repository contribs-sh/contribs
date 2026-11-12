import { resolve } from 'node:path';
import { runFetch } from './run';

const ROOT = resolve(import.meta.dirname, '../..');

runFetch(ROOT).catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
